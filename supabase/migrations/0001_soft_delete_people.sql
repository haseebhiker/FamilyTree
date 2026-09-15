-- Adds soft-delete to people. A "deleted" profile is never actually
-- removed — it's excluded from normal browsing/search and shows a
-- minimal "this profile has been deleted" placeholder instead, so
-- genealogy data can never be lost to a mistake. See schema.sql for the
-- fresh-install version of this same table (kept in sync with this file).

alter table people add column if not exists deleted_at timestamptz;
alter table people add column if not exists deleted_by uuid references auth.users(id);
alter table people add column if not exists delete_reason text;

create index if not exists people_deleted_at_idx on people(deleted_at) where deleted_at is not null;
