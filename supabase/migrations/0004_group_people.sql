-- Groups now tag people in the tree directly (e.g. "grandpa's tree"),
-- not app-user access circles. Replaces the member-based join/approve
-- workflow (group_memberships) with a simple curatorial tagging table
-- (group_people), managed only by a group's creator or an app admin.
--
-- Existing approved memberships are carried over via each member's own
-- linked person_id (a membership with no linked person has no person to
-- tag, so it's dropped rather than guessed at).

create table group_people (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  added_by uuid not null references members(id),
  added_at timestamptz not null default now(),
  unique (group_id, person_id)
);

create index group_people_group_idx on group_people(group_id);
create index group_people_person_idx on group_people(person_id);

insert into group_people (group_id, person_id, added_by, added_at)
select gm.group_id, m.person_id, coalesce(gm.approved_by, gm.member_id), coalesce(gm.approved_at, gm.requested_at)
from group_memberships gm
join members m on m.id = gm.member_id
where gm.status = 'approved' and m.person_id is not null
on conflict (group_id, person_id) do nothing;

alter table group_people enable row level security;

create policy "members can read group_people" on group_people
  for select using (auth.role() = 'authenticated');
create policy "creator or app admin can add group_people" on group_people
  for insert with check (
    is_admin() or group_id in (select id from groups where created_by = auth.uid())
  );
create policy "creator or app admin can delete group_people" on group_people
  for delete using (
    is_admin() or group_id in (select id from groups where created_by = auth.uid())
  );

drop policy if exists "group admin or app admin can update groups" on groups;
drop policy if exists "group admin or app admin can delete groups" on groups;
create policy "creator or app admin can update groups" on groups
  for update using (created_by = auth.uid() or is_admin());
create policy "creator or app admin can delete groups" on groups
  for delete using (created_by = auth.uid() or is_admin());

-- create_group() no longer creates a group_memberships row for the creator.
create or replace function create_group(p_name text, p_description text, p_is_public boolean)
returns groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group groups;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_is_public and not is_admin() then
    raise exception 'Only an admin can create a public group';
  end if;

  insert into groups (name, description, is_public, created_by)
    values (p_name, p_description, p_is_public, auth.uid())
    returning * into v_group;

  return v_group;
end;
$$;

-- group_memberships and is_group_admin() are no longer used anywhere.
drop policy if exists "members can read group_memberships" on group_memberships;
drop policy if exists "self-request or group/app admin can insert membership" on group_memberships;
drop policy if exists "group or app admin can update membership" on group_memberships;
drop policy if exists "self or group/app admin can delete membership" on group_memberships;
drop table group_memberships;
drop function if exists is_group_admin(uuid);
