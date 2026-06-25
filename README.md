# Home Passport + Home OS

Digitální pas nemovitosti (**Home Passport**, B2B předání developer → kupec) a správa
domácnosti (**Home OS**, B2C). Jeden codebase, jeden backend.

## Stack
- **Next.js 16** (App Router) + **React 19** + **TypeScript** + **Tailwind CSS 4**
- **Supabase** (Postgres + Auth + Storage, **EU region**) — RLS na každé tabulce
- **AI** přes multimodální LLM API (čtení dokumentů, rozpoznávání z fotek, odhad hodnoty, RAG)

## Zásadní princip datového modelu
Model je rozdělený na dvě vrstvy kvůli **předání nemovitosti** a GDPR:
- **Nemovitost** (přenosná novému majiteli): `property`, `system`, technické `document`, `inspection`
- **Osoba / Domácnost** (zůstává u člověka): `household`, `user`, `asset`, osobní `document`, `warranty`

Při prodeji se přenáší **jen vrstva Nemovitost**.

## Revizní engine
Lhůty jsou **kontextové**, ne plošné. Pro vlastníka-obyvatele je reálně povinný hlavně
komín (vyhl. 34/2016); elektro/plyn jsou povinné u pronájmu/SVJ/firmy nebo je vyžaduje
pojišťovna. Engine to počítá podle `property.usage`.

## Spuštění
```bash
cp .env.example .env   # doplň Supabase + AI klíče
npm install
npm run dev
```

## Demo data
Aby šla aplikace hned prozkoumat, je v `supabase/seed_demo.sql` připravená realistická
ukázková domácnost: 1 domácnost + členství, 1 aktivní rodinný dům s kontextem
(vlastní bydlení, komín na pevná paliva, plyn, elektro, FVE), vyplněné sekce pasu,
4 dokumenty (faktura, PENB, revizní zpráva komína, záruční list) včetně jednoho
**AI návrhu** (`document_extractions` ve stavu `draft`), 4 položky majetku v místnostech
s odhadem hodnoty a 6 připomínek revizí napříč `legal_required` / `insurance_recommended`
/ `recommended` — **jedna je po termínu** (kontrola komína). Připomínky drží poctivost
revizního enginu: jako „povinné ze zákona“ je označený jen komín.

Spuštění (v tomto pořadí):

1. **Vytvoř demo uživatele.** Řádek v `auth.users` nejde založit z SQL — nejdřív se
   zaregistruj v aplikaci na `/registrace`. Trigger `handle_new_user` ti automaticky
   založí profil i domácnost „Moje domácnost“ (seed ji jen přejmenuje a naplní).
2. **Zjisti jeho ID** v Supabase Studiu (SQL Editor):
   ```sql
   select id, email from auth.users order by created_at desc;
   ```
3. **Doplň ID do `supabase/seed_demo.sql`** — na jednom místě, úplně dole ve volání
   `pg_temp.hp_seed_demo('…')` (hledej značku `>>> ZDE DOPLŇTE ID <<<`). Placeholder je
   `00000000-0000-0000-0000-000000000001`.
4. **Spusť celý soubor:**
   - **Supabase Studio → SQL Editor →** vlož celý obsah `seed_demo.sql` → **Run**, nebo
   - CLI: `psql "$DATABASE_URL" -f supabase/seed_demo.sql`

Skript je **idempotentní** — lze ho spustit opakovaně (předchozí demo data dle pevných
UUID nejdřív smaže a vloží znovu). Když ID neodpovídá žádnému uživateli v `auth.users`,
transakce se bezpečně rollbackne a nic nezmění. Demo data koexistují s referenčními
`revision_rules` ze `supabase/seed.sql`.

> Pozn.: Soubory dokumentů fyzicky nenahráváme do Storage, takže náhled v detailu
> dokumentu zobrazí „Náhled není k dispozici“ — řádky, kategorie i AI návrh se ale
> zobrazí normálně.

## Bezpečnost
- `SUPABASE_SERVICE_ROLE_KEY` je server-only (`lib/supabase/admin.ts`).
- Storage URL jsou podepsané (TTL ≤ 1 h), žádný veřejný bucket.
- AI běží v EU regionu poskytovatele + DPA; provider je uveden jako subzpracovatel.
