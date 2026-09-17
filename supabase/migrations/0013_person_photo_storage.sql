-- Replaces the old "paste a photo URL" text field (which most people had
-- no real way to use — pasting a link means already having the photo
-- hosted somewhere) with real uploads: a browser-side compression step
-- shrinks the image to WebP under 200KB and produces a 200x200 square
-- thumbnail, both uploaded directly to Storage from the browser (never
-- through a Server Action — Vercel's ~4.5MB request body limit, same
-- reason file uploads work this way in the other apps).
alter table people add column if not exists photo_thumbnail_url text;

insert into storage.buckets (id, name, public)
values ('person-photos', 'person-photos', true)
on conflict (id) do nothing;

-- Public bucket (matches the old plain-text photo_url field, which was
-- already just an unauthenticated link — this doesn't reduce that): any
-- signed-in member can upload a photo for anyone (mirrors "Add a family
-- member" already being open to all members, not owner/admin-gated), but
-- only an admin can delete one, since deleting from Storage happens
-- directly from the browser with the anon key — RLS here is the actual
-- enforcement, the app's own owner-or-admin check on the DB update is a
-- separate, second gate on top of it.
create policy "signed-in members can upload person photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'person-photos');
create policy "admins can delete person photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'person-photos' and is_admin());
create policy "anyone can view person photos" on storage.objects
  for select using (bucket_id = 'person-photos');
