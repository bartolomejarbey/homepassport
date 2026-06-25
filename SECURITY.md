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

## 7. Manual RLS test matrix (adversarial re-verification of 0004)

The `0004` tightenings were re-verified adversarially on a throwaway Postgres 16
cluster with a Supabase-equivalent harness: the `auth`/`storage` schemas and the
`anon`/`authenticated`/`service_role` roles were emulated, `auth.uid()` reads the
JWT `sub` claim, and migrations `0001 → 0002 → 0003 → 0004` were applied verbatim
(only `vector(1536)` was stripped to `vector` because pgvector was not installed —
irrelevant to any policy). Two real users were seeded through `auth.users`, so
`handle_new_user()` created each one's profile + default household + `owner`
membership exactly as in production.

Two clients are distinguished, matching the app:

- **RLS client** = `SET ROLE authenticated` + the user's JWT `sub` (anon key + JWT).
- **admin** = `SET ROLE service_role` (`BYPASSRLS`) — the service-role client.

Legend: **DENY** = `new row violates row-level security policy` (or `UPDATE 0`
when `USING` hides the row); **ALLOW** = the write succeeds with the expected
affected-row count.

### 7.1 Attacker matrix — attacker **B** via the RLS client (every row must DENY)

| # | Table | Attacker action (B, RLS client) | Result |
| --- | --- | --- | --- |
| 1 | `document_extractions` | INSERT a `confirmed` extraction onto A's document | **DENY** |
| 1b | `document_extractions` | UPDATE B's own extraction, repoint `document_id` → A's doc | **DENY** |
| 2 | `organization_members` | INSERT self as `owner` of A's org | **DENY** |
| 3 | `household_members` | INSERT self into A's household | **DENY** |
| 4 | `property_owners` | INSERT (A's property, B's household) — self-attach takeover | **DENY** |
| 5 | `property_org_links` | INSERT (A's property, B's org) — org-wide takeover | **DENY** |
| 6 | `properties` | INSERT a property with `created_by_org_id` = A's org (forged attribution) | **DENY** |
| 7 | `documents` | INSERT doc with B's `household_id` **and** A's foreign `property_id` | **DENY** |
| 7b | `documents` | INSERT doc with only A's foreign `property_id` | **DENY** |
| 7c | `documents` | INSERT doc with no scope (`household_id` and `property_id` both null) | **DENY** |
| 8 | `reminders` | INSERT a reminder carrying A's `property_id` | **DENY** |
| 9 | `handover_invitations` | INSERT an `accepted` invite on A's property (direct self-claim) | **DENY** |
| 9a | `handover_invitations` | seller-side UPDATE `status → accepted` via RLS client | **DENY** |
| 9b | `handover_invitations` | INSERT a pending invite with forged `created_by` | **DENY** |
| 9c | `handover_invitations` | INSERT a pre-`accepted` invite (`accepted_by` set) | **DENY** |
| 10 | `ai_jobs` | INSERT an `ai_job` into A's household | **DENY** |
| 10b | `ai_jobs` | INSERT in own household with forged `created_by` = another user | **DENY** |
| 11 | `revision_rules` | INSERT a reference rule (read-only reference data) | **DENY** |
| 12 | `organizations` | UPDATE (rename) A's org as a non-member | **DENY** (`UPDATE 0`) |
| — | `documents` (read) | SELECT A's private document | **0 rows** |
| — | `document_extractions` (read) | SELECT A's extraction | **0 rows** |
| — | `properties` (read) | SELECT A's property | **0 rows** |

### 7.2 Legitimate matrix — rightful user **A** (every row must ALLOW)

Client column states which client the **app** uses for that write (this is what
makes the WITH CHECK tightenings safe — bootstrap writes go through admin/RPC,
which bypass RLS; everything else runs under RLS as the legitimate owner).

| Real flow | Table / op | App client | Result |
| --- | --- | --- | --- |
| `create_organization()` (first org owner) | `organizations` + `organization_members` INSERT | RPC `SECURITY DEFINER` | **ALLOW** |
| `handle_new_user()` (signup) | `profiles` + `households` + `household_members` INSERT | trigger `SECURITY DEFINER` | **ALLOW** |
| `createProperty` | `properties` + `property_owners` + `property_contexts` INSERT | **admin** | **ALLOW** |
| `createOrgProperty` | `properties` + `property_org_links` + `property_contexts` INSERT | **admin** | **ALLOW** |
| `uploadOrgDocument` | Storage upload + `documents` + `document_extractions` INSERT | **admin** | **ALLOW** |
| `/api/handover/accept` (buyer claim) | `handover_invitations` UPDATE + `property_owners` upsert + file move | **admin** | **ALLOW** |
| audit everywhere | `audit_events` INSERT | **admin** | **ALLOW** (RLS has SELECT-only) |
| `updatePropertyContext` | `property_contexts` UPSERT (own property) | RLS client | **ALLOW** |
| `updateProperty` | `properties` UPDATE (own property) | RLS client | **ALLOW** |
| `/api/ai/extract` | `document_extractions` INSERT/UPDATE (own doc) | RLS client | **ALLOW** |
| `confirmExtraction` / `rejectExtraction` (consumer) | `document_extractions` UPDATE + `documents` backfill | RLS client | **ALLOW** |
| document-detail reminder | `reminders` INSERT (own household+property) | RLS client | **ALLOW** |
| `/api/revize/generate` | `reminders` INSERT + supersession UPDATE (own) | RLS client | **ALLOW** |
| reminder `markDone` / `reopen` / `snooze` | `reminders` UPDATE (own) | RLS client | **ALLOW** |
| asset create (`PhotoCapture`) | `assets` + `asset_photos` INSERT (own household) | RLS client | **ALLOW** |
| `/api/ai/value` | `assets` UPDATE (own) | RLS client | **ALLOW** |
| `/api/handover/invite` | `handover_invitations` INSERT (`pending`, self `created_by`) | RLS client | **ALLOW** |
| handover revoke (seller) | `handover_invitations` UPDATE (stays non-accepted) | RLS client | **ALLOW** |
| `confirmPassportExtraction` / `rejectPassportExtraction` (B2B) | `document_extractions` UPDATE on org passport | RLS client | **ALLOW** (via `can_access_property` → `property_org_links` → `is_org_member`) |
| `ai_jobs` write (own, `created_by` = self **or** null) | `ai_jobs` INSERT | RLS client | **ALLOW** |
| org / household rename by **owner** | `organizations` / `households` UPDATE | RLS client | **ALLOW** (`is_org_admin` / `is_household_admin`) |
| co-owner manages owner link | `property_owners` INSERT when `can_access_property` already true | RLS client | **ALLOW** |

**Outcome:** every attack in §7.1 is denied and every legitimate write in §7.2
succeeds with the expected row count. No legitimate user-facing write regressed
under the new `WITH CHECK` clauses, so **no corrective migration was required**.
The single place where a non-bootstrap write deliberately rides the RLS client on
a property the caller does not *own* — the B2B `confirmPassportExtraction` on an
org passport — was explicitly verified to still pass (org access flows through
`property_org_links`), confirming the `document_extractions` tightening did not
break the B2B confirm/reject loop.

### 7.3 How to reproduce

`auth.uid()` must resolve inside `SECURITY DEFINER` bootstrap functions, so set
the JWT claim at **session** scope (not `is_local`) before calling the RPC:

```sql
-- impersonate the RLS client for user <uuid>
select set_config('request.jwt.claim.sub', '<uuid>', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
set role authenticated;          -- RLS now enforced as that user
--   ... attempt the write; observe ALLOW (row count) or DENY (RLS error) ...
reset role;                      -- back to a privileged role
set role service_role;           -- == admin client (BYPASSRLS) for bootstrap/audit
```

Run each row of §7.1 expecting an RLS error / `UPDATE 0`, and each row of §7.2
expecting `INSERT 0 1` / `UPDATE 1`. A legitimate write that returns `UPDATE 0`
(silently affecting nothing) is a regression: route it through the admin client
*after* an independent ownership re-check, or relax the specific `WITH CHECK`
minimally — never by re-introducing an `OR self`-grant escape hatch.
