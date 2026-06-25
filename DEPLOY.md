# Nasazení do produkce / Production Deployment

Tento návod provede nasazením **Home Passport + Home OS** na **Vercel** s
backendem **Supabase v EU regionu**. Cíl: data zákazníků zůstávají v EU a chybná
konfigurace selže rychle a čitelně.

> Předpoklady: účet na [Supabase](https://supabase.com) a [Vercel](https://vercel.com),
> repozitář na GitHubu, klíč k AI poskytovateli (OpenAI nebo EU-kompatibilní endpoint),
> volitelně účet [Resend](https://resend.com) pro transakční e-maily.

---

## 1. Supabase projekt (EU region)

1. **Create project** → vyber region v EU: **`eu-central-1` (Frankfurt)** nebo
   `eu-west-*`. Region projektu **nelze později změnit** — kvůli GDPR ho zvol hned.
2. Po vytvoření si v **Project Settings → API** zkopíruj:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** klíč → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** klíč → `SUPABASE_SERVICE_ROLE_KEY` (server-only, tajný!)

### 1a. Migrace a seedy (v tomto pořadí)

Schéma žije v `supabase/migrations/`. Spusť je **přesně v pořadí 0001 → 0004**,
pak referenční a (volitelně) demo data.

**Varianta A — Supabase Studio (SQL Editor):**
Otevři **SQL Editor**, vkládej a spouštěj obsah souborů jeden po druhém:

```
supabase/migrations/0001_init.sql           # schéma (Property vs Household), pgcrypto
supabase/migrations/0002_rls.sql            # RLS na každé tabulce, SECURITY DEFINER helpery
supabase/migrations/0003_storage.sql        # privátní buckety documents + assets, storage RLS
supabase/migrations/0004_security_fixes.sql # utažení WITH CHECK proti cross-tenant zápisu
supabase/seed.sql                           # referenční revision_rules (povinné pro engine)
```

**Varianta B — Supabase CLI (z kořene repa):**

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push                 # aplikuje migrace 0001–0004 z supabase/migrations/
psql "$DATABASE_URL" -f supabase/seed.sql
```

> `supabase/seed.sql` (revizní pravidla) je **povinný** — bez něj revizní engine
> nemá z čeho počítat lhůty. `0003_storage.sql` zakládá privátní buckety
> `documents` a `assets`; soubory se servírují **jen** přes podepsané URL (TTL ≤ 1 h).

### 1b. Demo data (volitelné)

Ukázková domácnost je v `supabase/seed_demo.sql`. Vyžaduje existujícího uživatele
(řádek v `auth.users` nejde založit ze SQL). Postup je v `README.md` v sekci
„Demo data": nejdřív se zaregistruj v nasazené aplikaci na `/registrace`, zjisti
své `id`, doplň ho dole v `pg_temp.hp_seed_demo('…')` a spusť celý soubor.
Skript je idempotentní. **Do čisté produkce demo data nenasazuj.**

---

## 2. Supabase Auth — redirect URL

Aplikace dělá e-mailové potvrzení registrace i obnovu hesla přes
`/auth/callback`. V **Authentication → URL Configuration** nastav:

- **Site URL:** `https://<tvoje-domena>` (např. `https://homepassport.app`)
- **Redirect URLs (allow list):** přidej oba:
  - `https://<tvoje-domena>/auth/callback`
  - `https://<tvoje-domena>/auth/callback?type=recovery`

Bez správného allow-listu skončí potvrzovací i obnovovací odkazy chybou.
Pro Preview deployments Vercelu přidej i `https://*.vercel.app/auth/callback`,
pokud chceš testovat auth z náhledových nasazení.

> E-mail šablony Supabase fungují v obou stylech odkazů (PKCE `?code=` i
> token-hash `?token_hash=&type=`) — callback handler zvládá oba, takže není
> potřeba nic přepisovat.

---

## 3. Proměnné prostředí na Vercelu

V **Vercel → Project → Settings → Environment Variables** nastav (pro
**Production**, ideálně i Preview). Úplný a autoritativní seznam je v
`.env.example`; validuje je `lib/env.ts` za běhu.

**Povinné / Required:**

| Proměnná | Zdroj |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role (tajné, server-only) |
| `OPENAI_API_KEY` | AI poskytovatel (viz §5) |
| `AI_MODEL` | např. `gpt-5.5` |

**Volitelné / Optional (funkce degradují bezpečně, když chybí):**

| Proměnná | Význam |
| --- | --- |
| `AI_PROVIDER` | informační label poskytovatele (default `openai`) |
| `AI_BASE_URL` | EU inference endpoint (viz §5); nevyplněno = default OpenAI |
| `AI_TIMEOUT_MS` | tvrdý timeout AI volání v ms (default 30000, floor 1000) |
| `RESEND_API_KEY` | transakční e-maily; **nevyplněno = bezpečný no-op** |
| `EMAIL_FROM` | ověřený odesílatel, `Display Name <addr@domena>` |
| `NEXT_PUBLIC_APP_URL` | veřejný origin pro sdílené odkazy předání (B2B) |
| `NEXT_PUBLIC_SITE_URL` | kanonická URL pro `sitemap.xml` / `robots.txt` |

> **Fail-fast:** `lib/env.ts` ověřuje povinné proměnné **líně za běhu** (ne při
> buildu), takže `next build` projde i bez nich, ale první request na špatně
> nakonfigurovaném nasazení selže s čitelnou dvojjazyčnou chybou, která vypíše
> přesně chybějící proměnné — nikdy ne `undefined!` zalomené hluboko v SDK.
> `SUPABASE_SERVICE_ROLE_KEY` patří **jen** na server; nikdy ho neprefixuj
> `NEXT_PUBLIC_`.

---

## 4. Region nasazení (EU)

`vercel.json` v kořeni pinuje běh do EU:

```json
{ "framework": "nextjs", "regions": ["fra1"] }
```

`fra1` (Frankfurt) drží Serverless/Edge funkce blízko Supabase EU projektu —
nízká latence a data nehnutá z EU. Když je tvůj Supabase v jiném EU regionu
(`eu-west-1` apod.), zvol odpovídající Vercel region (`cdg1` Paříž, `arn1`
Stockholm, `dub1` Dublin) a uprav `regions`.

---

## 5. AI poskytovatel — DPA a EU

AI provider zpracovává **obsah uživatelových dokumentů** (faktury, PENB, revizní
zprávy, fotky majetku). Proto:

1. **Drž inferenci v EU.** Pokud poskytovatel nabízí EU region / EU endpoint,
   nastav `AI_BASE_URL` na něj. Jinak ověř, kde se data zpracovávají.
2. **Podepiš DPA** (Data Processing Agreement) a uveď poskytovatele jako
   **subzpracovatele** ve své dokumentaci GDPR. Viz `SECURITY.md` (sekce DPA).
3. **Žádné tréninkové využití dat.** Ujisti se, že vstupy z API nejsou použity
   k tréninku modelů (u OpenAI je to default pro API; u jiného providera ověř).
4. `AI_TIMEOUT_MS` drží tvrdý timeout, aby zaseknuté volání selhalo rychle a
   nedrželo route otevřenou. `maxRetries` je v kódu omezeno na 1 (nákladová cesta).

---

## 6. Transakční e-mail (Resend) — volitelné

Bez `RESEND_API_KEY` je odesílání **bezpečný no-op** (zaloguje a přeskočí), takže
dev i CI běží bez něj a odkaz na předání se vždy vrátí v API odpovědi.
Pro reálné doručování pozvánek k předání:

1. V Resendu **ověř doménu** (SPF/DKIM).
2. Nastav `RESEND_API_KEY` a `EMAIL_FROM` (`Display Name <noreply@tvoje-domena>`).
3. Posíláme **jen transakční** poštu (pozvánky k předání) — žádný marketing,
   takže není potřeba opt-in (GDPR).

---

## 7. Deploy a poletové kontroly

1. **Import repo na Vercelu** → framework se detekuje jako Next.js (`vercel.json`
   to i explicitně pinuje). Build command `next build`, žádné override netřeba.
2. Po prvním buildu se ujisti, že jsou nastavené env (§3) a **redeployni**, aby
   se `NEXT_PUBLIC_*` propsaly i do klientského bundlu.
3. **Smoke test** na produkční doméně:
   - `/` se načte (veřejný marketing).
   - `/registrace` → potvrzovací e-mail → odkaz vede na `/auth/callback` a přihlásí.
   - `/prehled` po přihlášení (gated app shell).
   - Nahrání dokumentu → AI návrh (`document_extractions`), pak odhad/RAG.
   - `/pro` → vytvoř pozvánku k předání; ověř, že se vrátí sdílený odkaz (a když je
     nastavený Resend, že dorazí e-mail).
   - `/sitemap.xml` a `/robots.txt` ukazují produkční doménu (`NEXT_PUBLIC_SITE_URL`).
4. **Bezpečnost:** projdi `SECURITY.md`. RLS musí být aktivní na každé tabulce
   (migrace 0002 + 0004), buckety privátní (0003), service-role klíč jen na serveru.

---

## Rychlý checklist

- [ ] Supabase projekt v **EU regionu**
- [ ] Migrace `0001 → 0004` aplikované v pořadí
- [ ] `supabase/seed.sql` (revizní pravidla) nahrán
- [ ] (volitelně) `seed_demo.sql` jen mimo čistou produkci
- [ ] Auth **Site URL** + **Redirect URLs** (`/auth/callback`, `…?type=recovery`)
- [ ] Všechny **povinné** env na Vercelu (§3)
- [ ] `vercel.json` region = EU (`fra1`)
- [ ] AI: EU endpoint / **DPA podepsán**, žádný trénink na datech
- [ ] (volitelně) Resend: ověřená doména, `EMAIL_FROM`
- [ ] Smoke test prošel; `SECURITY.md` ověřeno
