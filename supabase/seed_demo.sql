-- ============================================================================
-- Home Passport + Home OS — DEMO seed data (explorable sample household)
-- ----------------------------------------------------------------------------
-- Naplní aplikaci realistickými ukázkovými daty pro JEDNOHO přihlášeného
-- uživatele: 1 domácnost (+ členství), 1 aktivní rodinný dům s kontextem,
-- sekce pasu, pár dokumentů (+ 1 AI návrh), majetek v místnostech a připomínky
-- revizí (povinné × doporučené × kvůli pojišťovně, jedna po termínu).
--
-- POCTIVOST REVIZÍ: u vlastníka-obyvatele je ze zákona povinný jen KOMÍN
-- (vyhl. 34/2016 Sb.). Plyn a elektro jsou jen "kvůli pojišťovně"
-- (insurance_recommended), hromosvod je "doporučené" (recommended). Tento seed
-- to dodržuje — žádná připomínka netvrdí "ze zákona", pokud to tak není.
--
-- Idempotentní: skript nejdřív smaže předchozí demo data (dle pevných UUID)
-- a vloží je znovu. Lze ho tedy spustit opakovaně.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) KTERÝ UŽIVATEL? Doplňte ID demo uživatele na JEDNOM místě — úplně dole
--    v tomto souboru, ve volání  pg_temp.hp_seed_demo('<UUID>')  (hledejte
--    značku >>> ZDE DOPLŇTE ID <<<).
--
--    Řádek v auth.users vytvořit z SQL NELZE — uživatele nejdřív zaregistrujte
--    v aplikaci (/registrace), pak jeho ID najdete takto:
--        select id, email from auth.users order by created_at desc;
--
--    Spuštění (portabilní — bez psql meta-příkazů, takže funguje i ve Studiu):
--      • Supabase Studio → SQL Editor → vložit CELÝ soubor → Run.
--      • nebo CLI:  psql "$DATABASE_URL" -f supabase/seed_demo.sql
--
--    Tip: necháte-li placeholder '00000000-0000-0000-0000-000000000001' a žádný
--    takový uživatel neexistuje, skript se bezpečně zastaví s jasnou hláškou
--    (transakce se rollbackne) a NIC nezmění.
-- ----------------------------------------------------------------------------

begin;

-- ----------------------------------------------------------------------------
-- 2) Pevná UUID demo entit — díky nim je seed idempotentní a čistě smazatelný.
-- ----------------------------------------------------------------------------
-- household: necháváme dynamický (viz níže) — použijeme existující domácnost
-- uživatele (zakládá ji trigger handle_new_user při registraci), aby appka
-- ukazovala data ve "své" domácnosti. Ostatní entity mají pevná UUID.

-- property
--   11111111-1111-1111-1111-111111111111
-- documents
--   d0c00000-0000-0000-0000-000000000001  (faktura — kotel)
--   d0c00000-0000-0000-0000-000000000002  (PENB)
--   d0c00000-0000-0000-0000-000000000003  (revizní zpráva — komín)
--   d0c00000-0000-0000-0000-000000000004  (záruka — tepelné čerpadlo)
-- assets
--   a55e7000-0000-0000-0000-000000000001 .. 004
-- passport_sections / reminders / extraction: viz níže (pevná UUID s prefixy)

-- ----------------------------------------------------------------------------
-- 3) Veškerou práci uděláme v jedné plpgsql funkci, ať můžeme:
--      - ověřit existenci uživatele,
--      - dohledat / založit jeho domácnost,
--      - počítat termíny relativně k dnešku (jedna připomínka po termínu),
--      - a celé to bezpečně zopakovat.
-- ----------------------------------------------------------------------------
create or replace function pg_temp.hp_seed_demo(p_user uuid)
returns text language plpgsql as $$
declare
  v_household uuid;
  v_property  uuid := '11111111-1111-1111-1111-111111111111';
begin
  -- (a) uživatel musí existovat v auth.users (FK cíl pro created_by/user_id atd.)
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then
    raise exception
      'Demo uživatel % neexistuje v auth.users. Nejdřív se zaregistrujte v aplikaci (/registrace) a doplňte správné ID do volání pg_temp.hp_seed_demo(...) na konci tohoto souboru.',
      coalesce(p_user::text, '(null)');
  end if;

  -- (b) profil (trigger handle_new_user ho zakládá při registraci; pro jistotu upsert)
  insert into public.profiles (id, full_name, locale)
  values (p_user, 'Demo Uživatel', 'cs')
  on conflict (id) do update
    set full_name = coalesce(public.profiles.full_name, excluded.full_name);

  -- (c) domácnost: použij existující (z triggeru), jinak založ demo domácnost.
  --     Bereme nejstarší členství uživatele — appka volí domácnost přes
  --     household_members .limit(1), takže demo data musí žít právě v ní.
  select hm.household_id into v_household
  from public.household_members hm
  where hm.user_id = p_user
  order by hm.created_at asc
  limit 1;

  if v_household is null then
    v_household := gen_random_uuid();
    insert into public.households (id, name, created_by)
    values (v_household, 'Domácnost Novákových (demo)', p_user);
    insert into public.household_members (household_id, user_id, role)
    values (v_household, p_user, 'owner');
  else
    -- pojmenujeme ji demo-friendly a zajistíme členství 'owner'
    update public.households set name = 'Domácnost Novákových (demo)' where id = v_household;
    insert into public.household_members (household_id, user_id, role)
    values (v_household, p_user, 'owner')
    on conflict (household_id, user_id) do update set role = 'owner';
  end if;

  -- (d) idempotence: smaž případná předchozí demo data této domácnosti.
  --     property mažeme dle pevného UUID; navázané řádky (contexts, sections,
  --     documents, extractions, reminders) padají kaskádou přes FK on delete cascade.
  delete from public.assets    where household_id = v_household and id in (
    'a55e7000-0000-0000-0000-000000000001','a55e7000-0000-0000-0000-000000000002',
    'a55e7000-0000-0000-0000-000000000003','a55e7000-0000-0000-0000-000000000004');
  delete from public.properties where id = v_property;  -- cascade: owners/contexts/sections/docs/reminders

  -- (e) NEMOVITOST (přenosná vrstva) — aktivní rodinný dům
  insert into public.properties
    (id, type, title, street, city, postal_code, country, cadastral_id, status)
  values
    (v_property, 'house', 'Rodinný dům Pod Lipami',
     'Pod Lipami 14', 'Říčany', '251 01', 'CZ', '1234/5', 'active');

  insert into public.property_owners (property_id, household_id)
  values (v_property, v_household);

  -- kontext: vlastní bydlení; komín na pevná paliva + plyn + elektro.
  -- (Z toho engine poctivě odvodí: komín = ze zákona, plyn/elektro = pojišťovna.)
  insert into public.property_contexts
    (property_id, owner_occupied, rental, svj, business_use,
     has_chimney, chimney_fuel, has_gas, has_electrical, has_lps, has_pv)
  values
    (v_property, true, false, false, false,
     true, 'solid', true, true, false, true);

  -- (f) SEKCE PASU — pár vyplněných oblastí (kind dle PassportSections.tsx).
  insert into public.passport_sections (id, property_id, kind, title, data) values
    ('5ec00000-0000-0000-0000-000000000001', v_property, 'construction', 'Hrubá stavba',
     jsonb_build_object(
       'summary','Zděný dům (Porotherm 44), základová deska 2018, sedlová střecha — betonová taška.',
       'rok_kolaudace', 2019, 'zastavena_plocha_m2', 118, 'pocet_podlazi', 2)),
    ('5ec00000-0000-0000-0000-000000000002', v_property, 'technology', 'Vytápění a TUV',
     jsonb_build_object(
       'summary','Tepelné čerpadlo vzduch-voda NIBE F2120 + podlahové vytápění; krbová kamna na dřevo.',
       'zdroj_tepla','tepelné čerpadlo', 'zalozni_zdroj','krbová kamna', 'bojler_l', 200)),
    ('5ec00000-0000-0000-0000-000000000003', v_property, 'penb', 'Energetický průkaz',
     jsonb_build_object(
       'summary','PENB třída B (velmi úsporná). Platnost do 2033.',
       'trida','B', 'platnost_do','2033-04-30')),
    ('5ec00000-0000-0000-0000-000000000004', v_property, 'inspections', 'Komín',
     jsonb_build_object(
       'summary','Kontrola spalinové cesty 09/2024 — bez závad. Pevná paliva: čištění 3×/rok.',
       'posledni_kontrola','2024-09-12', 'vysledek','bez závad')),
    ('5ec00000-0000-0000-0000-000000000005', v_property, 'warranties', 'Záruky technologií',
     jsonb_build_object(
       'summary','Tepelné čerpadlo NIBE — záruka 5 let do 2028. Fotovoltaika — měniče 10 let.',
       'tc_zaruka_do','2028-05-20')),
    ('5ec00000-0000-0000-0000-000000000006', v_property, 'equipment', 'Pevné vybavení',
     jsonb_build_object(
       'summary','Kuchyňská linka na míru (2019), vestavěné skříně v ložnici, garážová vrata Hörmann.',
       'kuchyne','na míru'));

  -- (g) DOKUMENTY (zdroj pravdy). file_path je pod <household_id>/... dle Storage
  --     RLS (storage_household_ok). Soubory fyzicky neexistují — náhled v UI
  --     degraduje na "Náhled není k dispozici", ale řádek, kategorie i AI návrh
  --     se zobrazí. transferable=true => putuje s nemovitostí (pas).
  insert into public.documents
    (id, property_id, household_id, category, title, file_path, mime, size_bytes,
     owner_scope, transferable, uploaded_by)
  values
    -- faktura za kotel/TČ — soukromá (k vlastníkovi, ne k nemovitosti)
    ('d0c00000-0000-0000-0000-000000000001', v_property, v_household, 'invoice',
     'Faktura — instalace tepelného čerpadla',
     v_household || '/demo/faktura-tepelne-cerpadlo.pdf', 'application/pdf', 184320,
     'household', false, p_user),
    -- PENB — přenosné (součást pasu)
    ('d0c00000-0000-0000-0000-000000000002', v_property, v_household, 'penb',
     'PENB — průkaz energetické náročnosti',
     v_household || '/demo/penb-prukaz.pdf', 'application/pdf', 256000,
     'property', true, p_user),
    -- revizní zpráva komín — přenosné (součást pasu)
    ('d0c00000-0000-0000-0000-000000000003', v_property, v_household, 'inspection',
     'Revizní zpráva — spalinová cesta (komín)',
     v_household || '/demo/revize-komin-2024.pdf', 'application/pdf', 142336,
     'property', true, p_user),
    -- záruční list TČ — přenosné (technický, jde s domem)
    ('d0c00000-0000-0000-0000-000000000004', v_property, v_household, 'warranty',
     'Záruční list — tepelné čerpadlo NIBE',
     v_household || '/demo/zaruka-nibe.pdf', 'application/pdf', 98304,
     'property', true, p_user);

  -- (h) AI NÁVRH (draft) — jeden koncept k faktuře. Tvar 'extracted' odpovídá
  --     DocExtraction (category, supplier, date, amount, currency, summary,
  --     confidence...). status='draft' => v UI "Návrh" k potvrzení/odmítnutí.
  insert into public.document_extractions
    (id, document_id, extracted, confidence, provider, model, status)
  values
    ('e8c00000-0000-0000-0000-000000000001',
     'd0c00000-0000-0000-0000-000000000001',
     jsonb_build_object(
       'category','invoice',
       'supplier','TeploTech s.r.o.',
       'date','2023-05-18',
       'amount', 289000,
       'currency','CZK',
       'summary','Dodávka a montáž tepelného čerpadla vzduch-voda NIBE F2120 vč. akumulační nádrže.',
       'confidence', 0.91),
     0.91, 'openai', 'gpt-5.5', 'draft');

  -- (i) MAJETEK (Home OS) — položky v místnostech s odhadem hodnoty.
  --     estimated_value se na /majetek sčítá; source 'photo' dostane odznak "Z fotky".
  insert into public.assets
    (id, household_id, property_id, name, category, room, brand, model,
     purchase_date, purchase_price, currency, estimated_value, estimated_value_confidence,
     warranty_until, source, created_by)
  values
    ('a55e7000-0000-0000-0000-000000000001', v_household, v_property,
     'Lednice s mrazákem', 'Spotřebiče', 'Kuchyně', 'Bosch', 'KGN39VLEB',
     '2022-03-10', 24990, 'CZK', 18000, 0.7,
     '2025-03-10', 'manual', p_user),
    ('a55e7000-0000-0000-0000-000000000002', v_household, v_property,
     'Pračka', 'Spotřebiče', 'Koupelna', 'LG', 'F4WV510S0E',
     '2021-11-02', 15490, 'CZK', 9000, 0.65,
     NULL, 'document', p_user),
    ('a55e7000-0000-0000-0000-000000000003', v_household, v_property,
     'Televize 55"', 'Elektronika', 'Obývací pokoj', 'Samsung', 'QE55Q70C',
     '2023-09-20', 21990, 'CZK', 16000, 0.6,
     '2025-09-20', 'photo', p_user),
    ('a55e7000-0000-0000-0000-000000000004', v_household, v_property,
     'Sekačka robotická', 'Zahrada', 'Garáž', 'Husqvarna', 'Automower 305',
     '2020-05-15', 18000, 'CZK', 7500, 0.55,
     NULL, 'manual', p_user);

  -- (j) PŘIPOMÍNKY / REVIZE — poctivě dle wording_type. legal_basis ladí s
  --     revision_rules ze seed.sql. Termíny relativní k dnešku:
  --       - 1× po termínu (overdue): kontrola komína propadlá o ~2 měsíce,
  --       - ostatní v budoucnu v realistických intervalech.
  insert into public.reminders
    (id, property_id, household_id, document_id, type, title, due_date,
     wording_type, legal_basis, status)
  values
    -- KOMÍN — jediná skutečně zákonná povinnost u vlastníka-obyvatele. PO TERMÍNU.
    ('5e312000-0000-0000-0000-000000000001', v_property, v_household,
     'd0c00000-0000-0000-0000-000000000003', 'inspection',
     'Kontrola spalinové cesty (komín)', current_date - interval '58 days',
     'legal_required', 'Vyhláška č. 34/2016 Sb. (zák. 320/2015 Sb.)', 'open'),
    -- ČIŠTĚNÍ KOMÍNA — pevná paliva 3×/rok; další termín brzy. Doporučené.
    ('5e312000-0000-0000-0000-000000000002', v_property, v_household,
     NULL, 'service',
     'Čištění komína (pevná paliva, 3×/rok)', current_date + interval '24 days',
     'recommended', 'Vyhláška č. 34/2016 Sb.', 'open'),
    -- PLYN — pro vlastníka RD NENÍ povinné ze zákona; kvůli pojišťovně.
    ('5e312000-0000-0000-0000-000000000003', v_property, v_household,
     NULL, 'inspection',
     'Revize plynového kotle / rozvodů', current_date + interval '3 months',
     'insurance_recommended', '§19 NV 191/2022 Sb. — vlastníci RD/bytů vyňati', 'open'),
    -- ELEKTRO — u vlastního bydlení zákon nepředepisuje; kvůli pojišťovně.
    ('5e312000-0000-0000-0000-000000000004', v_property, v_household,
     NULL, 'inspection',
     'Revize elektroinstalace', current_date + interval '7 months',
     'insurance_recommended', 'NV 190/2022 Sb. / ČSN 33 1500', 'open'),
    -- ZÁRUKA TČ — konec záruky tepelného čerpadla. Doporučené (hlídání lhůty).
    ('5e312000-0000-0000-0000-000000000005', v_property, v_household,
     'd0c00000-0000-0000-0000-000000000004', 'warranty',
     'Konec záruky: tepelné čerpadlo NIBE', date '2028-05-20',
     'recommended', NULL, 'open'),
    -- SERVIS TČ — výrobcem doporučený roční servis. Doporučené. (Hotovo = ukázka stavu.)
    ('5e312000-0000-0000-0000-000000000006', v_property, v_household,
     NULL, 'service',
     'Roční servis tepelného čerpadla', current_date - interval '20 days',
     'recommended', NULL, 'done');

  return format(
    'Demo data vložena: domácnost %s, nemovitost %s (4 dokumenty, 1 AI návrh, 4 položky majetku, 6 připomínek).',
    v_household, v_property);
end $$;

-- ----------------------------------------------------------------------------
-- >>> ZDE DOPLŇTE ID demo uživatele <<<  (nahraďte placeholder UUID z auth.users)
-- ----------------------------------------------------------------------------
select pg_temp.hp_seed_demo('00000000-0000-0000-0000-000000000001'::uuid) as result;

commit;
