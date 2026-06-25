-- ============================================================================
-- Private Storage buckets + RLS. Files live under <household_id>/...
-- Served ONLY via short-lived signed URLs (TTL <= 1h) generated server-side.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('documents','documents',false), ('assets','assets',false)
on conflict (id) do nothing;

-- helper: first path segment must be a household the user belongs to
create or replace function public.storage_household_ok(objname text)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare seg text; hid uuid;
begin
  seg := (storage.foldername(objname))[1];
  begin hid := seg::uuid; exception when others then return false; end;
  return is_household_member(hid);
end; $$;
grant execute on function public.storage_household_ok to authenticated;

create policy "hp_files_select" on storage.objects for select
  using (bucket_id in ('documents','assets') and storage_household_ok(name));
create policy "hp_files_insert" on storage.objects for insert
  with check (bucket_id in ('documents','assets') and storage_household_ok(name));
create policy "hp_files_update" on storage.objects for update
  using (bucket_id in ('documents','assets') and storage_household_ok(name));
create policy "hp_files_delete" on storage.objects for delete
  using (bucket_id in ('documents','assets') and storage_household_ok(name));
