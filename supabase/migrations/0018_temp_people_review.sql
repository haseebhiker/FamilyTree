-- Review workflow for the temp_people staging table (people to add/update
-- from an outside source), driven by the admin "Import Review" page.
alter table temp_people add column if not exists review_status text not null default 'pending';
alter table temp_people drop constraint if exists temp_people_review_status_check;
alter table temp_people add constraint temp_people_review_status_check
  check (review_status in ('pending', 'confirmed', 'added', 'skipped'));
alter table temp_people add column if not exists resolved_people_id uuid references people(id) on delete set null;
alter table temp_people add column if not exists reviewed_at timestamptz;
create unique index if not exists temp_people_shaheen_id_key on temp_people (shaheen_id);

-- Family data: admins only.
alter table temp_people enable row level security;
drop policy if exists "admins manage temp_people" on temp_people;
create policy "admins manage temp_people" on temp_people
  for all using (is_admin()) with check (is_admin());
