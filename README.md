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
cp .env.example .env.local   # doplň Supabase + AI klíče
npm install
npm run dev
```

Povinné proměnné prostředí validuje za běhu `lib/env.ts` (Zod). Chybná
konfigurace selže rychle a čitelně (dvojjazyčná chyba s výpisem chybějících
proměnných) — ale `next build` projde i bez nich (validace je líná, ne při
importu). Úplný seznam proměnných je v `.env.example`.

## Nasazení do produkce
Krok za krokem (Supabase EU projekt, migrace `0001–0004` + seedy, env na Vercelu,
EU region, Auth redirect URL, DPA k AI poskytovateli) je v **`DEPLOY.md`**.
Region běhu pinuje `vercel.json` do EU (`fra1`).

## CI a testy
Každý push a pull request do `main` spouští GitHub Actions workflow
(`.github/workflows/ci.yml`) na Node 22: `npm ci` → typecheck (`tsc --noEmit`) →
`npm run build` → `npm test`.

### Testy
Jednotkové testy běží přes **Vitest** (`npm test`, tj. `vitest run`). Pokrývají čistou
logiku: revizní engine a jeho hraniční případy, deduplikaci připomínek, ochranu proti
open-redirectu, bezpečné skládání cest k souborům, validační Zod schémata, parsování
AI výstupů a `cn()` merger tříd. Žádný test nevyžaduje DB ani síť.

### End-to-end testy (Playwright)
E2E testy běží odděleně od Vitestu přes **Playwright** (`npm run test:e2e`). Pokrývají
**veřejný povrch** aplikace, takže běží i **bez Supabase / AI klíčů** (stačí placeholder
hodnoty v `.env.local`): úvodní stránka (hero + B2B/B2C sekce + navigace + CTA na
`/registrace` a `/pro/poptavka`), přihlášení a registrace (klientská zod validace,
zachování `?next` při přepnutí login↔signup), veřejný formulář pilotu `/pro/poptavka`,
neplatný předávací token `/prevzit/<token>` (chybový stav bez pádu) a přesměrování
nepřihlášeného uživatele z chráněné route `/prehled` na `/prihlaseni`.

Specy jsou v `e2e/*.spec.ts`, konfigurace v `playwright.config.ts`. Konfigurace si sama
spustí dev server (`npm run dev -- -p 3010`, `reuseExistingServer`) a používá
**předinstalovaný Chromium** z `PLAYWRIGHT_BROWSERS_PATH` (`/opt/pw-browsers`) — proto
**nespouštějte `playwright install`**. Tyto testy nejsou součástí CI (`npm test`), aby
běh zůstal bez DB a sítě.

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
