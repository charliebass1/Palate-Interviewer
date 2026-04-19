-- Storage bucket for uploaded research materials.
-- Run after 0001_init.sql.

insert into storage.buckets (id, name, public)
values ('materials', 'materials', false)
on conflict (id) do nothing;

-- Only the owner of the parent project can read/write material objects.
-- Object path convention: `{project_id}/{material_id}/{filename}`.

create policy "materials bucket read"
on storage.objects for select
using (
  bucket_id = 'materials'
  and exists (
    select 1 from public.projects p
    where p.id::text = split_part(name, '/', 1)
      and p.owner_id = auth.uid()
  )
);

create policy "materials bucket write"
on storage.objects for insert
with check (
  bucket_id = 'materials'
  and exists (
    select 1 from public.projects p
    where p.id::text = split_part(name, '/', 1)
      and p.owner_id = auth.uid()
  )
);

create policy "materials bucket delete"
on storage.objects for delete
using (
  bucket_id = 'materials'
  and exists (
    select 1 from public.projects p
    where p.id::text = split_part(name, '/', 1)
      and p.owner_id = auth.uid()
  )
);
