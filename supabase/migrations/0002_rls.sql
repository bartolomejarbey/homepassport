-- ============================================================================
-- RLS-first security (gpt-5.5 risk #4: cross-tenant leakage is the top risk)
-- Helper fns are SECURITY DEFINER to avoid policy recursion.
-- ============================================================================

create or replace function public.is_org_member(oid uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from organization_members m
                where m.organization_id = oid and m.user_id = auth.uid());
$$;

create or replace function public.is_household_member(hid uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from household_members m
                where m.household_id = hid and m.user_id = auth.uid());
$$;

create or replace function public.can_access_property(pid uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from property_owners po
    join household_members hm on hm.household_id = po.household_id
    where po.property_id = pid and hm.user_id = auth.uid()
  ) or exists(
    select 1 from property_org_links pol
    join organization_members om on om.organization_id = pol.organization_id
    where pol.property_id = pid and om.user_id = auth.uid()
  );
$$;

grant execute on function public.is_org_member, public.is_household_member, public.can_access_property to authenticated;

-- ---------- enable RLS everywhere ----------
do $$ declare t text;
begin
  for t in select tablename from pg_tables where schemaname='public'
           and tablename in ('profiles','organizations','organization_members','households',
           'household_members','properties','property_owners','property_org_links',
           'property_contexts','passport_sections','documents','document_extractions',
           'assets','asset_photos','reminders','revision_rules','handover_invitations',
           'ai_jobs','embeddings','audit_events')
  loop execute format('alter table public.%I enable row level security;', t); end loop;
end $$;

-- ---------- policies ----------
create policy profiles_self on profiles
  using (id = auth.uid()) with check (id = auth.uid());

create policy orgs_member_read on organizations for select using (is_org_member(id));
create policy orgs_insert on organizations for insert with check (created_by = auth.uid());
create policy orgs_admin_update on organizations for update using (is_org_member(id));

create policy orgmem_read on organization_members for select using (is_org_member(organization_id));
create policy orgmem_write on organization_members for all
  using (is_org_member(organization_id)) with check (is_org_member(organization_id) or user_id = auth.uid());

create policy hh_read on households for select using (is_household_member(id));
create policy hh_insert on households for insert with check (created_by = auth.uid());
create policy hh_update on households for update using (is_household_member(id));

create policy hhmem_read on household_members for select using (is_household_member(household_id));
create policy hhmem_write on household_members for all
  using (is_household_member(household_id)) with check (is_household_member(household_id) or user_id = auth.uid());

create policy prop_access on properties for all
  using (can_access_property(id)) with check (can_access_property(id) or created_by_org_id is not null);
create policy propowner_access on property_owners for all
  using (can_access_property(property_id) or is_household_member(household_id))
  with check (is_household_member(household_id) or can_access_property(property_id));
create policy proporg_access on property_org_links for all
  using (is_org_member(organization_id) or can_access_property(property_id))
  with check (is_org_member(organization_id));
create policy propctx_access on property_contexts for all
  using (can_access_property(property_id)) with check (can_access_property(property_id));
create policy passport_access on passport_sections for all
  using (can_access_property(property_id)) with check (can_access_property(property_id));

create policy docs_access on documents for all
  using ( (household_id is not null and is_household_member(household_id))
       or (property_id  is not null and can_access_property(property_id)) )
  with check ( (household_id is not null and is_household_member(household_id))
       or (property_id is not null and can_access_property(property_id)) );
create policy extractions_access on document_extractions for all
  using (exists(select 1 from documents d where d.id=document_id and
        ((d.household_id is not null and is_household_member(d.household_id)) or
         (d.property_id is not null and can_access_property(d.property_id)))))
  with check (true);

create policy assets_access on assets for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));
create policy assetphotos_access on asset_photos for all
  using (exists(select 1 from assets a where a.id=asset_id and is_household_member(a.household_id)))
  with check (exists(select 1 from assets a where a.id=asset_id and is_household_member(a.household_id)));

create policy reminders_access on reminders for all
  using ( (household_id is not null and is_household_member(household_id))
       or (property_id is not null and can_access_property(property_id)) )
  with check ( (household_id is not null and is_household_member(household_id))
       or (property_id is not null and can_access_property(property_id)) );

-- reference data: read-only to all authenticated users
create policy rules_read on revision_rules for select using (auth.role() = 'authenticated');

create policy handover_access on handover_invitations for all
  using (can_access_property(property_id)) with check (can_access_property(property_id));

create policy aijobs_access on ai_jobs for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));
create policy embeddings_access on embeddings for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));
create policy audit_read on audit_events for select
  using ( (household_id is not null and is_household_member(household_id))
       or (organization_id is not null and is_org_member(organization_id)) );

-- ---------- bootstrap RPCs (avoid chicken-and-egg on first owner) ----------
create or replace function public.create_organization(p_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare oid uuid;
begin
  insert into organizations(name, created_by) values (p_name, auth.uid()) returning id into oid;
  insert into organization_members(organization_id, user_id, role) values (oid, auth.uid(), 'owner');
  return oid;
end; $$;
grant execute on function public.create_organization to authenticated;

-- ---------- new-user trigger: profile + default household ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
declare hid uuid;
begin
  insert into public.profiles(id, full_name) values (new.id, new.raw_user_meta_data->>'full_name')
    on conflict (id) do nothing;
  insert into public.households(name, created_by) values ('Moje domácnost', new.id) returning id into hid;
  insert into public.household_members(household_id, user_id, role) values (hid, new.id, 'owner');
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
