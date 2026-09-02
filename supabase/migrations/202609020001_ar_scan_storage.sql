-- Store image targets captured and compiled by administrators during placement.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ar-maps',
  'ar-maps',
  true,
  15728640,
  array['application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins upload ar maps" on storage.objects;
create policy "admins upload ar maps"
on storage.objects for insert to authenticated
with check (bucket_id = 'ar-maps' and public.is_admin());

drop policy if exists "admins update ar maps" on storage.objects;
create policy "admins update ar maps"
on storage.objects for update to authenticated
using (bucket_id = 'ar-maps' and public.is_admin())
with check (bucket_id = 'ar-maps' and public.is_admin());

drop policy if exists "admins delete ar maps" on storage.objects;
create policy "admins delete ar maps"
on storage.objects for delete to authenticated
using (bucket_id = 'ar-maps' and public.is_admin());
