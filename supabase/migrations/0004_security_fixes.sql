-- ============================================================================
-- 0004 — RLS security fixes (cross-tenant leakage hardening)
--
-- Deep audit of 0002 found several policies whose WITH CHECK was far more
-- permissive than their USING, opening cross-tenant WRITE holes. With RLS, a
-- pure INSERT is gated ONLY by WITH CHECK (USING governs the rows an UPDATE/
-- DELETE/SELECT may *touch*, not what an INSERT may *create*). So a too-loose
-- WITH CHECK lets an authenticated user, hitting PostgREST directly with the
-- anon key + their own JWT, fabricate rows that grant themselves access to a
-- stranger's property / household / organization.
--
-- IMPORTANT — why these tightenings are safe for the app:
--   Every legitimate "bootstrap" write that needs to sidestep RLS (creating the
--   first owner link, the first org membership, claiming a handover) already
--   runs through the SERVICE-ROLE admin client or a SECURITY DEFINER function
--   (create_organization, handle_new_user). Those bypass RLS entirely, so
--   removing the self-grant escape hatches below breaks NO legitimate flow —
--   it only removes the attack surface. App code only ever *reads* these tables
--   with the RLS client (verified across app/ + lib/).
--
-- This migration is idempotent (drop policy if exists -> recreate) and does NOT
-- alter already-applied migrations destructively.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper: does the current user belong to the org that "owns" a property?
-- can_access_property() also returns true once a property_org_link exists, but
-- for the org-link WITH CHECK we must check membership of the org being linked,
-- BEFORE the link row exists — otherwise the check is circular and self-proving.
-- We additionally allow linking a property the caller already legitimately
-- reaches (e.g. an owner household member adding their builder), which is the
-- only non-bootstrap case.
-- ----------------------------------------------------------------------------

-- ============================================================================
-- HOLE 1 (CRITICAL) — document_extractions: WITH CHECK (true)
-- Any user could INSERT an extraction pointing at ANOTHER household's document,
-- or UPDATE a visible extraction and repoint its document_id at a foreign doc
-- (USING gates the old row; WITH CHECK(true) waved the new one through). That
-- both pollutes a victim's document with attacker-controlled "confirmed" data
-- and, on the buyer-facing /prevzit page, can surface forged "key dates".
-- Fix: WITH CHECK must mirror USING — the parent document must be one the
-- caller can access.
-- ============================================================================
drop policy if exists extractions_access on public.document_extractions;
create policy extractions_access on public.document_extractions for all
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_id
        and ( (d.household_id is not null and is_household_member(d.household_id))
           or (d.property_id  is not null and can_access_property(d.property_id)) )
    )
  )
  with check (
    exists (
      select 1 from public.documents d
      where d.id = document_id
        and ( (d.household_id is not null and is_household_member(d.household_id))
           or (d.property_id  is not null and can_access_property(d.property_id)) )
    )
  );

-- ============================================================================
-- HOLE 2 (CRITICAL) — organization_members: self-grant via WITH CHECK
-- The "OR user_id = auth.uid()" in WITH CHECK let ANY authenticated user INSERT
-- a row making THEMSELVES a member — at role 'owner' — of ANY organization,
-- since for an INSERT only WITH CHECK is evaluated. That is a full org takeover
-- (read all org passports, invite/handover, etc.).
-- Fix: only an existing member of the SAME org may write membership rows. The
-- first owner is seeded by create_organization() (SECURITY DEFINER), so the app
-- never needs the self-insert path.
-- (Tradeoff documented in SECURITY.md: this is admin-managed membership; adding
--  a NEW member is an admin action — there is no self-join. Acceptable for MVP.)
-- ============================================================================
drop policy if exists orgmem_write on public.organization_members;
drop policy if exists orgmem_read  on public.organization_members;
-- Keep read for members of the org.
create policy orgmem_read on public.organization_members for select
  using (is_org_member(organization_id));
-- Writes (insert/update/delete) only by an existing member of that same org.
create policy orgmem_write on public.organization_members for all
  using (is_org_member(organization_id))
  with check (is_org_member(organization_id));

-- ============================================================================
-- HOLE 3 (CRITICAL) — household_members: identical self-grant hole
-- "OR user_id = auth.uid()" let any user INSERT themselves into ANY household
-- (default role 'member'), gaining read/write to that household's private
-- assets, documents, reminders and AI data. handle_new_user() seeds the first
-- owner via SECURITY DEFINER, so the self-insert escape hatch is unnecessary.
-- Fix: only an existing member of the same household may write membership rows.
-- ============================================================================
drop policy if exists hhmem_write on public.household_members;
drop policy if exists hhmem_read  on public.household_members;
create policy hhmem_read on public.household_members for select
  using (is_household_member(household_id));
create policy hhmem_write on public.household_members for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

-- ============================================================================
-- HOLE 4 (CRITICAL) — property_owners: attach ANY property to my household
-- WITH CHECK allowed "is_household_member(household_id)" on its own, so a user
-- could INSERT (victim_property_id, my_household_id). That immediately makes
-- can_access_property(victim_property) true for them (owner -> household path),
-- i.e. a full property takeover that also bypasses the entire handover/token
-- flow and pulls every transferable document into the attacker's household.
-- The ONLY legitimate writers are createProperty() and handover/accept — both
-- use the service-role admin client. So RLS must NOT permit a self-attach.
-- Fix: require the caller to ALREADY be able to access the property; with no
-- legitimate RLS-client writer, this effectively closes self-service inserts
-- while still allowing a co-owner (who can already access it) to manage links.
-- ============================================================================
drop policy if exists propowner_access on public.property_owners;
create policy propowner_access on public.property_owners for all
  using (can_access_property(property_id) or is_household_member(household_id))
  with check (can_access_property(property_id));

-- ============================================================================
-- HOLE 5 (CRITICAL) — property_org_links: link ANY property to my org
-- WITH CHECK was only "is_org_member(organization_id)", so any org member could
-- INSERT (victim_property_id, my_org_id) and thereby make
-- can_access_property(victim_property) true for the whole org. Cross-tenant
-- takeover. createOrgProperty() / invite read these via RLS but INSERT via the
-- admin client, so RLS does not need to allow the self-link.
-- Fix: WITH CHECK requires BOTH org membership AND that the caller already can
-- access the property (e.g. an owner adding their builder, or the admin client
-- which bypasses RLS for the genuine chicken-and-egg create).
-- ============================================================================
drop policy if exists proporg_access on public.property_org_links;
create policy proporg_access on public.property_org_links for all
  using (is_org_member(organization_id) or can_access_property(property_id))
  with check (is_org_member(organization_id) and can_access_property(property_id));

-- ============================================================================
-- HOLE 6 (HIGH) — properties: forge created_by_org_id on insert
-- WITH CHECK "can_access_property(id) OR created_by_org_id is not null" let a
-- user INSERT a property simply by setting any non-null created_by_org_id
-- (an org they don't belong to). The row is orphaned (no owner/link) so it is
-- not directly readable, but it (a) lets a user forge org attribution and write
-- arbitrary rows, and (b) is needless write surface. Genuine creation uses the
-- admin client.
-- Fix: a brand-new property is created via admin (RLS bypassed). Under RLS, a
-- user may only touch a property they can access; if created_by_org_id is set,
-- it must be an org they belong to.
-- ============================================================================
drop policy if exists prop_access on public.properties;
create policy prop_access on public.properties for all
  using (can_access_property(id))
  with check (
    can_access_property(id)
    or (created_by_org_id is not null and is_org_member(created_by_org_id))
  );

-- ============================================================================
-- HOLE 7 (MEDIUM) — documents: cross-layer pollution via OR WITH CHECK
-- docs_access WITH CHECK was an OR over household/property. A user could INSERT
-- a document with their OWN household_id but a FOREIGN property_id (which they
-- cannot access). Because docs_access SELECT also ORs, the foreign property's
-- legitimate owner would then SEE that injected document on their passport
-- (can_access_property path), and if transferable=true it could ride a later
-- handover. Content-injection across tenants.
-- Fix: you may assert a property_id ONLY if you can access that property, and a
-- household_id ONLY if you are a member. When both are set, you must satisfy
-- both (AND), not either. Consumer uploads always attach to the user's OWN
-- property, so this does not break the legitimate flow.
-- ============================================================================
drop policy if exists docs_access on public.documents;
create policy docs_access on public.documents for all
  using (
       (household_id is not null and is_household_member(household_id))
    or (property_id  is not null and can_access_property(property_id))
  )
  with check (
    -- at least one scope must be asserted
    (household_id is not null or property_id is not null)
    -- every asserted scope must be one the caller legitimately controls
    and (household_id is null or is_household_member(household_id))
    and (property_id  is null or can_access_property(property_id))
  );

-- ============================================================================
-- HOLE 8 (MEDIUM) — reminders: same cross-layer pollution shape as documents
-- reminders_access WITH CHECK ORed household/property, so a user could create a
-- reminder carrying a foreign property_id (visible to that property's owner via
-- the can_access_property SELECT path). Fix mirrors documents: each asserted
-- scope must be controlled by the caller. Legitimate reminders (revize engine,
-- confirm-extraction) only ever use the user's own household/property.
-- ============================================================================
drop policy if exists reminders_access on public.reminders;
create policy reminders_access on public.reminders for all
  using (
       (household_id is not null and is_household_member(household_id))
    or (property_id  is not null and can_access_property(property_id))
  )
  with check (
    (household_id is not null or property_id is not null)
    and (household_id is null or is_household_member(household_id))
    and (property_id  is null or can_access_property(property_id))
  );

-- ============================================================================
-- HOLE 9 (LOW/DEFENSE-IN-DEPTH) — handover_invitations: forge created_by / claim
-- handover_access was FOR ALL with USING/WITH CHECK = can_access_property only.
-- That is correct for the seller side (an org member or owner creates/revokes a
-- pending invite). But it left two soft edges:
--   • created_by / accepted_by were not constrained, so a seller-side caller
--     could insert an invite stamped with someone else's created_by.
--   • a caller with property access could directly UPDATE status to 'accepted'
--     and set accepted_by — the buyer-claim path is supposed to run ONLY through
--     the admin client in /api/handover/accept (the buyer has NO property access
--     yet, by design). RLS should keep the claim out of reach of the RLS client.
-- Fix: split policies. Read for property-accessors. Insert only as oneself and
-- only as a 'pending' invite for a property you can access. Update/delete for
-- property-accessors, but the row must REMAIN non-accepted (claiming is an
-- admin-only/service action; accepted_by stays null on the RLS path). The real
-- accept flow uses the service role and is unaffected.
-- ============================================================================
drop policy if exists handover_access on public.handover_invitations;

create policy handover_read on public.handover_invitations for select
  using (can_access_property(property_id));

create policy handover_insert on public.handover_invitations for insert
  with check (
    can_access_property(property_id)
    and created_by = auth.uid()
    and status = 'pending'
    and accepted_by is null
  );

-- Seller-side management (revoke / re-send bookkeeping) — but never self-claim:
-- the new row must stay unaccepted. Buyer acceptance is performed by the
-- service-role client in /api/handover/accept, which bypasses RLS.
create policy handover_update on public.handover_invitations for update
  using (can_access_property(property_id))
  with check (
    can_access_property(property_id)
    and status <> 'accepted'
    and accepted_by is null
  );

create policy handover_delete on public.handover_invitations for delete
  using (can_access_property(property_id));

-- ============================================================================
-- HOLE 10 (LOW) — ai_jobs / embeddings: bind created_by to the caller
-- aijobs_access / embeddings_access correctly scope to the household, but did
-- not pin created_by, so a household member could write rows attributed to
-- another user. Low impact (same household), tightened for honest provenance.
-- household scoping is preserved; embeddings has no created_by column so it is
-- left as-is (household check already prevents cross-tenant writes).
-- ============================================================================
drop policy if exists aijobs_access on public.ai_jobs;
create policy aijobs_access on public.ai_jobs for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id) and (created_by is null or created_by = auth.uid()));

-- embeddings: household scoping is already sufficient (no actor column); keep
-- the symmetric USING/WITH CHECK but re-assert it explicitly for clarity.
drop policy if exists embeddings_access on public.embeddings;
create policy embeddings_access on public.embeddings for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

-- ============================================================================
-- HOLE 11 (DEFENSE-IN-DEPTH) — revision_rules: explicitly read-only
-- 0002 created only a SELECT policy, so writes are already denied by default
-- with RLS enabled. We make the read-only intent explicit and ensure no
-- accidental write policy can be assumed. (Reference data is seeded via
-- migrations / service role only.)
-- ============================================================================
drop policy if exists rules_read on public.revision_rules;
create policy rules_read on public.revision_rules for select
  using (auth.role() = 'authenticated');
-- (No insert/update/delete policy => writes denied for all non-service clients.)

-- ============================================================================
-- HOLE 12 (DEFENSE-IN-DEPTH) — organizations: tighten update + drop redundant
-- orgs_admin_update used USING(is_org_member(id)) which lets ANY member (incl.
-- role 'member') rename the org and, more importantly, had NO WITH CHECK, so an
-- update could in principle change row scoping. Restrict updates to org
-- owners/admins and pin WITH CHECK to the same org.
-- is_org_member stays the read gate. We add a stricter role check for updates.
-- ============================================================================
create or replace function public.is_org_admin(oid uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from organization_members m
    where m.organization_id = oid
      and m.user_id = auth.uid()
      and m.role in ('owner','admin')
  );
$$;
grant execute on function public.is_org_admin to authenticated;

drop policy if exists orgs_admin_update on public.organizations;
create policy orgs_admin_update on public.organizations for update
  using (is_org_admin(id))
  with check (is_org_admin(id));

-- households: same shape — only owner/admin may rename/modify the household row.
create or replace function public.is_household_admin(hid uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from household_members m
    where m.household_id = hid
      and m.user_id = auth.uid()
      and m.role in ('owner','admin')
  );
$$;
grant execute on function public.is_household_admin to authenticated;

drop policy if exists hh_update on public.households;
create policy hh_update on public.households for update
  using (is_household_admin(id))
  with check (is_household_admin(id));

-- ============================================================================
-- Note on assets / asset_photos / property_contexts / passport_sections:
-- their policies are already symmetric (USING == WITH CHECK over the correct
-- ownership predicate) and scope strictly to the household / accessible
-- property. No change required; re-verified during this audit.
-- ============================================================================
