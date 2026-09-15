create table suggestions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  message text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'done')),
  admin_note text,
  created_at timestamptz not null default now()
);

create index suggestions_member_idx on suggestions(member_id);
create index suggestions_status_idx on suggestions(status);

alter table suggestions enable row level security;

create policy "member can insert own suggestion" on suggestions
  for insert with check (member_id = auth.uid());
create policy "member reads own, admin reads all" on suggestions
  for select using (member_id = auth.uid() or is_admin());
create policy "admin updates suggestions" on suggestions
  for update using (is_admin());
