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

## Bezpečnost
- `SUPABASE_SERVICE_ROLE_KEY` je server-only (`lib/supabase/admin.ts`).
- Storage URL jsou podepsané (TTL ≤ 1 h), žádný veřejný bucket.
- AI běží v EU regionu poskytovatele + DPA; provider je uveden jako subzpracovatel.
