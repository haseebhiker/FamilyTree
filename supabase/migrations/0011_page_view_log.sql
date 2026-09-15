-- Full navigation log (design ask: "I want to know what who saw... entire
-- navigation - ARMAAN saw shama etc, that way I know how they are using
-- and put more emphasis"). Separate from login_log, which only records
-- sign-in EVENTS, not what a member did once signed in. Same
-- self-insert-own-row / admin-read-only / rolling-retention shape as
-- login_log, with a 7-day window instead of 30 (per the ask) and a `path`
-- column instead of `email`.
create table page_view_log (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  path text not null,
  viewed_at timestamptz not null default now()
);

create index page_view_log_viewed_at_idx on page_view_log(viewed_at);
create index page_view_log_member_idx on page_view_log(member_id);

alter table page_view_log enable row level security;

-- Read is admin-only, same reasoning as login_log: who looked at what is
-- sensitive browsing history, not something to expose to other members.
create policy "admins read page_view_log" on page_view_log
  for select using (is_admin());
create policy "self can insert own page_view_log row" on page_view_log
  for insert with check (auth.uid() = member_id);
create policy "anyone authenticated can delete expired page_view_log rows" on page_view_log
  for delete using (auth.role() = 'authenticated' and viewed_at < now() - interval '7 days');
create policy "admin can delete any page_view_log row" on page_view_log
  for delete using (is_admin());
