# Security model — Home Passport + Home OS

> Scope of this document: the data-isolation / authorization model and the deep
> RLS audit performed on `supabase/migrations/*`, `lib/supabase/*`, every
> `app/api/*/route.ts`, and all server actions. The #1 risk for this product is
> **cross-tenant data leakage** (one household / organization reading or writing
> another's rows). This file records the model, the concrete holes that were
> found and fixed in `0004_security_fixes.sql`, and the residual risks.

## 1. Tenancy & data model

Two private tenant types, one shared transferable layer:

- **Household** (`households` + `household_members`) — a family's private world:
  `assets`, `asset_photos`, household-scoped `documents`, `reminders`,
  `ai_jobs`, `embeddings`. Never transfers.
- **Organization** (`organizations` + `organization_members`) — a B2B tenant
  (developer / property manager / agent). Reaches properties only through
  `property_org_links`.
- **Property** (`properties`) — the **transferable** layer. Owned by households
  via `property_owners`, optionally linked to orgs via `property_org_links`.
  On sale, the property + its `transferable=true` documents move to the buyer's
  household via the handover flow. Private household data never moves.

Source of truth = the uploaded **document**. AI output is always a **draft**
(`document_extractions.status='draft'`) the user explicitly confirms/rejects;
nothing AI-produced is auto-trusted.

## 2. Authorization layers (defense in depth)

1. **`proxy.ts`** (Next.js 16 proxy, formerly middleware) refreshes the Supabase
   session and gate-keeps protected page prefixes (`/prehled`, `/nemovitost`,
   `/dokumenty`, `/majetek`, `/pripominky`, `/hledat`, `/pro`). `/pro/poptavka`
   is a deliberate public carve-out (B2B sales page).
2. **Layout gates** re-check `auth.getUser()` server-side
   (`app/(app)/layout.tsx`, `app/(pro)/pro/(console)/layout.tsx`) and redirect
   unauthenticated users. Page protection never depends on the client.
3. **RLS on every table** (`0002` enables it on all 20 public tables; `0004`
   tightens the policies). This is the real isolation boundary — even if app
   code is wrong, Postgres rejects cross-tenant rows.
4. **Zod validation** on every API route and server action input (UUIDs,
   enums, sizes), with `.strict()` where extra fields must be rejected
   (`updatePropertyContext`, `updateProperty`).
5. **Signed Storage URLs only** (TTL ≤ 1h), generated server-side. Buckets
   `documents` and `assets` are private (`public=false`); raw object paths are
   never exposed to clients.

### Supabase clients (who runs as what)

| Client | Key | RLS | Use |
| --- | --- | --- | --- |
| `lib/supabase/client.ts` | anon (public) | enforced | browser components |
| `lib/supabase/server.ts` | anon (public) | enforced | Server Components, actions, routes |
| `lib/supabase/admin.ts` | **service role** | **bypassed** | server-only, narrow bootstrap/audit writes |

`admin.ts` is `import "server-only"`; it is never imported by a `"use client"`
module (audited). The service-role key lives only in `SUPABASE_SERVICE_ROLE_KEY`
(server env). No secret (`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`) is read
from any client bundle; `.env*` is git-ignored except `.env.example`
(placeholders only). The OpenAI client (`lib/ai/index.ts`) is `server-only`.

### Where the service role is used — and why each is safe

Every service-role write is preceded by an **independent ownership re-check**
through the RLS client, and is only used where RLS genuinely cannot allow the
write (true chicken-and-egg) or where RLS intentionally forbids it (audit log):

- **`createOrganization`** → `create_organization()` RPC (`SECURITY DEFINER`)
  inserts org + owner membership atomically; admin then writes the audit row.
- **`createProperty` / `createOrgProperty`** → property + owner/org link can't
  exist before the row, so they are created with admin **after** verifying the
  caller's household/org membership via the RLS client. A failed link insert
  rolls back the orphan property.
- **`uploadOrgDocument` / `getPassportDocuments`** → org-property files live
  under `<property_id>/…`, which Storage RLS (household-keyed) cannot sign for a
  household-less org; admin signs **after** the RLS client confirms an
  `property_org_links` row proves the caller's org access. Document rows are read
  under RLS first, so only already-authorized paths are signed.
- **`/api/handover/accept`** → the buyer has **no** RLS access to the invitation
  or property yet (by design), so the token claim, owner-link creation, and
  transferable-file move run with admin. The token is a one-time bearer claim,
  validated (exists / pending / not expired / not already owned by a foreign
  household) before any write; the claim is an atomic `pending → accepted`
  update so concurrent accepts can't double-spend it.
- **Audit writes** (`audit_events`) everywhere → the table has only a `SELECT`
  RLS policy, so writes must use admin or they would be silently dropped.

No admin write was found that skips an ownership check.

## 3. Holes found and fixed (`0004_security_fixes.sql`)

The audit found several policies whose `WITH CHECK` was far more permissive than
their `USING`. **A pure `INSERT` is gated only by `WITH CHECK`** (USING governs
which existing rows an UPDATE/DELETE/SELECT may touch). So an over-loose
`WITH CHECK` let an authenticated user — hitting PostgREST directly with the
anon key + their own JWT — fabricate rows that grant themselves access to
another tenant. All were verified exploitable on the pre-fix schema and verified
closed after the fix (functional RLS test: attacker user B against victim user
A; pre-fix the attacks succeeded and B could read A's private document, post-fix
every attack is rejected while A's own flows still work).

| # | Severity | Table | Hole | Fix |
| --- | --- | --- | --- | --- |
| 1 | **Critical** | `document_extractions` | `WITH CHECK (true)` — insert/repoint an extraction onto **any** document (forge "confirmed" data, surfaced on the buyer page) | `WITH CHECK` now mirrors `USING` (parent document must be accessible) |
| 2 | **Critical** | `organization_members` | `OR user_id = auth.uid()` let a user **insert themselves as `owner` of any org** (full org takeover) | writes require existing membership of the same org; first owner seeded by `create_organization()` |
| 3 | **Critical** | `household_members` | same self-join — insert self into **any household**, read its private assets/docs | writes require existing membership; first owner seeded by `handle_new_user()` |
| 4 | **Critical** | `property_owners` | `is_household_member(household_id)` alone let a user **attach any property to their own household** → `can_access_property` becomes true → property takeover bypassing handover | `WITH CHECK = can_access_property(property_id)`; legit owner-link creation uses admin |
| 5 | **Critical** | `property_org_links` | `WITH CHECK` only checked org membership → **link any property to your org** → org-wide takeover | `WITH CHECK = is_org_member(org) AND can_access_property(property)` |
| 6 | High | `properties` | `OR created_by_org_id is not null` let a user insert a property with a **forged org attribution** | `WITH CHECK` requires accessible property, or `created_by_org_id` ∈ caller's orgs |
| 7 | Medium | `documents` | OR `WITH CHECK` let a user attach a doc to a **foreign `property_id`** (own household), polluting the victim's passport and possibly riding a handover | each asserted scope must be controlled by the caller (AND, not OR) |
| 8 | Medium | `reminders` | same cross-layer pollution shape as documents | same per-scope `WITH CHECK` |
| 9 | Low/DiD | `handover_invitations` | single `FOR ALL` policy let a property-accessor forge `created_by` and **directly self-`accepted`** an invite (the claim is meant to be admin-only) | split into read/insert/update/delete; insert must be self + `pending`; update may not set `accepted` (buyer claim stays admin-only) |
| 10 | Low | `ai_jobs` | `created_by` not pinned to caller (intra-household provenance) | `WITH CHECK` pins `created_by` to `auth.uid()` when set |
| 11 | DiD | `revision_rules` | read-only intent implicit | explicit read-only; no write policy ⇒ writes denied to non-service clients |
| 12 | DiD | `organizations`, `households` | `UPDATE` allowed any member and had **no `WITH CHECK`** | `UPDATE` restricted to owner/admin via `is_org_admin` / `is_household_admin`, with matching `WITH CHECK` |

Tables re-verified as already-correct (symmetric `USING`/`WITH CHECK` over the
right ownership predicate, no change needed): `profiles`, `assets`,
`asset_photos`, `property_contexts`, `passport_sections`, `embeddings`
(household-scoped, no actor column), and the Storage policies in `0003`
(household-folder UUID cast + bucket scoping; org uploads correctly use the
service role).

### Helper functions

All access helpers (`is_org_member`, `is_household_member`,
`can_access_property`, and new `is_org_admin`, `is_household_admin`) are
`SECURITY DEFINER` with a pinned `search_path=public` to avoid RLS recursion and
search-path hijacking.

## 4. Storage

- Buckets `documents`, `assets` are private. Policies (`0003`) require the first
  path segment to be a household the user belongs to
  (`storage_household_ok` casts segment 1 to `uuid`, returns false on a bad
  cast). Consumer uploads key paths as `<household_id>/<uuid>-<name>`.
- Org-property files have **no** household segment, so they are uploaded,
  listed, signed, and (on handover) moved exclusively with the service role,
  after org-access is verified via RLS.
- Files are served only via short-lived signed URLs (TTL 1h) generated
  server-side. On handover, transferable objects are physically moved under the
  buyer's `<household_id>/` prefix so the buyer's normal RLS flows can reach them.

## 5. Residual risks / follow-ups (not blocking)

- **Membership management is admin-only by policy.** After `0004`, adding a
  member to an org/household requires an *existing* member to write the row
  (there is no self-join). The product has no in-app "invite teammate to org /
  household" UI yet; when built, route it through a `SECURITY DEFINER` RPC that
  validates an invite token (mirroring `create_organization`) — do **not**
  re-introduce a self-insert policy.
- **`match_embeddings` RPC.** `/api/ai/search` calls an optional pgvector RPC and
  falls back to in-JS cosine over household-scoped rows. If that RPC is added in
  production it must be `SECURITY DEFINER` *and* filter by the caller's household
  (`match_household_id` is passed, but enforce it inside the function — don't
  trust the argument); otherwise it can become a cross-tenant read path that
  bypasses RLS. Until added, the fallback runs fully under RLS.
- **AI prompt-injection.** Document/photo content is attacker-influenceable, but
  AI output is always a confirm/reject draft and is range/enum-sanitized server
  side (`/api/ai/value`, `/api/ai/recognize`, extraction category normalization),
  so a malicious document cannot silently write trusted data or escalate access.
  RAG answers are constrained to the user's own chunks with a fixed disclaimer.
- **Rate limiting.** AI routes (`/api/ai/*`) and the handover endpoints have no
  per-user rate limit; they are auth-gated but a logged-in user could drive cost.
  Add a limiter (e.g. per-user token bucket) before GA.
- **`pgvector` / DPA.** Keep AI inference in an EU region and sign a DPA
  (`AI_BASE_URL`), per `.env.example`. GDPR: marketing email requires explicit
  opt-in (`profiles.marketing_opt_in`); transactional mail does not.

## 6. How the fix was validated

A throwaway Postgres 16 instance applied `0001 → 0002 → 0003 → 0004` cleanly,
then ran a functional RLS suite impersonating two authenticated users:

- **Pre-fix (0002 only):** attacker B could insert itself into A's household and
  org, attach A's property to B's household, **read A's private document**, and
  forge a "confirmed" extraction on A's document — all succeeded.
- **Post-fix (with 0004):** all of the above are rejected by row-level security,
  while A's own reads, extraction insert, handover-invite creation, and context
  upsert still succeed, and even A cannot self-`accept` a handover via the RLS
  client (that path is service-role only).
