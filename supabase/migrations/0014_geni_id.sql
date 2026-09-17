-- Geni.com profile id, for a future import that matches/links this tree
-- against Geni's records. Nullable and unset for everyone until that
-- import runs.
alter table people add column if not exists geni_id text unique;
