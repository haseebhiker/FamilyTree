insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

-- Path convention: <person_id>/<filename> — lets the owner/admin policies
-- below check who a given object belongs to without a separate table.
create policy "Photos are publicly readable"
on storage.objects for select
using (bucket_id = 'photos');

create policy "Owner or admin can upload a photo"
on storage.objects for insert
with check (
  bucket_id = 'photos'
  and (
    public.is_admin()
    or exists (
      select 1 from members
      where members.id = auth.uid()
      and members.person_id::text = (storage.foldername(name))[1]
    )
  )
);

create policy "Owner or admin can replace a photo"
on storage.objects for update
using (
  bucket_id = 'photos'
  and (
    public.is_admin()
    or exists (
      select 1 from members
      where members.id = auth.uid()
      and members.person_id::text = (storage.foldername(name))[1]
    )
  )
);

create policy "Owner or admin can delete a photo"
on storage.objects for delete
using (
  bucket_id = 'photos'
  and (
    public.is_admin()
    or exists (
      select 1 from members
      where members.id = auth.uid()
      and members.person_id::text = (storage.foldername(name))[1]
    )
  )
);
