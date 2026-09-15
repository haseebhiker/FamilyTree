-- One row per successful sign-in (see schema.sql for the full comment).
-- Rolling 30-day retention is enforced by the DELETE policy's own age
-- condition, not application code.

create table if not exists login_log (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  email text not null,
  logged_in_at timestamptz not null default now()
);

create index if not exists login_log_logged_in_at_idx on login_log(logged_in_at);

alter table login_log enable row level security;

create policy "admins read login_log" on login_log
  for select using (is_admin());
create policy "self can insert own login_log row" on login_log
  for insert with check (auth.uid() = member_id);
create policy "anyone authenticated can delete expired login_log rows" on login_log
  for delete using (auth.role() = 'authenticated' and logged_in_at < now() - interval '30 days');
create policy "admin can delete any login_log row" on login_log
  for delete using (is_admin());
