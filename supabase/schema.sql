-- Family Tree App — initial database schema
-- Run this once in the Supabase project's SQL Editor to create everything.

-- ---------------------------------------------------------------------------
-- People (the tree itself)
-- ---------------------------------------------------------------------------
create table people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  preferred_name text,
  other_names text,
  surname_tag text,
  father_id uuid references people(id) on delete set null,
  mother_id uuid references people(id) on delete set null,
  living_status text not null default 'unknown' check (living_status in ('living', 'deceased', 'unknown')),
  -- Partial dates: any of year/month/day may be null (e.g. year-only, or a
  -- month+day with no known year) — see src/lib/partial-date.ts for the
  -- display/parsing rules. Checks just catch obviously-invalid input; a
  -- day without a month, or a value out of range, is rejected at the DB
  -- level as well as in the form.
  birth_year int,
  birth_month int check (birth_month between 1 and 12),
  birth_day int check (birth_day between 1 and 31),
  death_year int,
  death_month int check (death_month between 1 and 12),
  death_day int check (death_day between 1 and 31),
  place_of_birth text,
  place_of_death text,
  current_location text,
  photo_url text,
  bio text,
  facebook_url text,
  linkedin_url text,
  legacy_id text unique,
  -- Soft delete only — genealogy data should never be truly destroyed by a
  -- mistake. A "deleted" profile is excluded from normal browsing/search
  -- and shows a minimal "this profile has been deleted" placeholder to
  -- everyone but an admin (who sees the full record plus a Restore
  -- button); anyone who still lands on it via an old link is told it's
  -- deleted rather than getting a bare 404. deleted_by references
  -- auth.users directly (not members) purely to dodge the same
  -- forward-reference ordering issue members has elsewhere in this file.
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  delete_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (birth_day is null or birth_month is not null),
  check (death_day is null or death_month is not null)
);

create index people_deleted_at_idx on people(deleted_at) where deleted_at is not null;

create index people_father_idx on people(father_id);
create index people_mother_idx on people(mother_id);
create index people_full_name_idx on people using gin (to_tsvector('simple', full_name));

-- Marriages/spouse links. A person can appear as person_a or person_b in
-- multiple rows (multiple marriages). Children point at this indirectly by
-- having father_id/mother_id both set to a pair that matches one row here.
create table spouses (
  id uuid primary key default gen_random_uuid(),
  person_a_id uuid not null references people(id) on delete cascade,
  person_b_id uuid not null references people(id) on delete cascade,
  marriage_notes text,
  created_at timestamptz not null default now(),
  check (person_a_id <> person_b_id)
);

create unique index spouses_unique_pair_idx on spouses (
  least(person_a_id, person_b_id), greatest(person_a_id, person_b_id)
);

-- ---------------------------------------------------------------------------
-- Accounts, invites, roles
-- ---------------------------------------------------------------------------

-- One row per invited email. A login is only allowed once an invite exists
-- with status = 'accepted' or 'pending' (pending flips to accepted on first
-- successful login — see src/app/auth/callback/route.ts).
create table invites (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  role text not null default 'member' check (role in ('member', 'admin', 'super_admin')),
  person_id uuid references people(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- Self-service "request access" flow: a Google account that signed in but
-- isn't on the invite list lands on /not-authorized, which offers this
-- form instead of a dead end. auth_user_id ties it to their live Supabase
-- auth session (they're authenticated, just not yet a member) so an
-- admin's approval only needs to create an `invites` row — the requester's
-- existing session picks it up next time accept_invite() runs, no need to
-- sign in again.
create table access_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  relation_description text not null,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now()
);

create index access_requests_status_idx on access_requests(status);

-- One row per signed-in account, id = auth.users.id. Role/person link are
-- copied from the invite at first login so this table (not the invite) is
-- the source of truth for "who can do what" from then on.
create table members (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  role text not null default 'member' check (role in ('member', 'admin', 'super_admin')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  person_id uuid references people(id) on delete set null,
  invite_id uuid references invites(id),
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

create index members_person_idx on members(person_id);

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------

-- Public groups can only be created by an app admin; private ones by any
-- member, who becomes that group's own admin (group_memberships.role).
-- Super admins can manage every group regardless of membership.
create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_public boolean not null default false,
  created_by uuid not null references members(id),
  created_at timestamptz not null default now()
);

-- One row per (group, member). The creator gets role='admin',
-- status='approved' immediately (see create_group() below). Anyone else
-- joining goes in as role='member', status='pending' until a group admin
-- (or app admin) approves them — except when a group admin adds someone
-- directly, which goes straight to 'approved' ("who creates the group...
-- can add anyone there").
create table group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'approved')),
  requested_at timestamptz not null default now(),
  approved_by uuid references members(id),
  approved_at timestamptz,
  unique (group_id, member_id)
);

create index group_memberships_group_idx on group_memberships(group_id);
create index group_memberships_member_idx on group_memberships(member_id);

-- ---------------------------------------------------------------------------
-- Privacy
-- ---------------------------------------------------------------------------

-- Per-field privacy setting, set by the profile owner (or an admin for
-- unclaimed profiles). Absence of a row = the field-specific default
-- applied in application code (see src/lib/privacy.ts). visibility =
-- 'groups' means "visible to members of specific groups" — see which ones
-- in field_privacy_groups below.
create table field_privacy (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  field_name text not null check (field_name in (
    'birth_date', 'death_date',
    'current_location', 'facebook_url', 'linkedin_url',
    'place_of_birth', 'place_of_death'
  )),
  visibility text not null check (visibility in ('everyone', 'admins_only', 'just_me', 'groups')),
  updated_at timestamptz not null default now(),
  unique (person_id, field_name)
);

-- Which groups can see a field_privacy row when its visibility = 'groups'.
create table field_privacy_groups (
  field_privacy_id uuid not null references field_privacy(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  primary key (field_privacy_id, group_id)
);

-- Contact details (phone/email/address) — a person can have several of
-- each (e.g. two mobile numbers), so these live in their own table rather
-- than single columns on people. Each entry carries its own visibility
-- rather than sharing one field-level setting, since e.g. a work phone and
-- a personal phone might reasonably get different audiences.
-- `value` holds an AES-256-GCM ciphertext, encrypted at the app layer
-- (src/lib/vault-crypto.ts) before it ever reaches Supabase — plaintext
-- phone/email/address never touches the database or a backup file. See
-- README.md for the VAULT_ENCRYPTION_KEY this requires. Phone numbers are
-- always stored in E.164 (e.g. +14155551234) so WhatsApp/tel: links work
-- for anyone regardless of country — enforced in the app form, not here.
create table contact_details (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  contact_type text not null check (contact_type in ('phone', 'email', 'address')),
  label text,
  value text not null,
  visibility text not null default 'admins_only' check (visibility in ('everyone', 'admins_only', 'just_me', 'groups')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contact_details_person_idx on contact_details(person_id);

-- Which groups can see a contact_details row when its visibility = 'groups'.
create table contact_detail_groups (
  contact_detail_id uuid not null references contact_details(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  primary key (contact_detail_id, group_id)
);

-- ---------------------------------------------------------------------------
-- Edit/approval workflow
-- ---------------------------------------------------------------------------

create table pending_changes (
  id uuid primary key default gen_random_uuid(),
  change_type text not null check (change_type in (
    'edit_person', 'add_person', 'add_relationship', 'propose_deletion'
  )),
  target_person_id uuid references people(id) on delete cascade,
  proposed_data jsonb not null default '{}'::jsonb,
  previous_data jsonb not null default '{}'::jsonb,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_by uuid not null references members(id),
  reviewed_by uuid references members(id),
  admin_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index pending_changes_status_idx on pending_changes(status);
create index pending_changes_submitted_by_idx on pending_changes(submitted_by);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people(id) on delete set null,
  change_type text not null,
  old_value jsonb,
  new_value jsonb,
  performed_by uuid references members(id),
  submitted_by uuid references members(id),
  pending_change_id uuid references pending_changes(id),
  note text,
  created_at timestamptz not null default now()
);

create index audit_log_person_idx on audit_log(person_id);

-- One row per successful sign-in (not just first-ever — every time
-- someone completes the Google OAuth flow). Rolling 30-day retention:
-- rather than a cron job, every insert opportunistically deletes its own
-- rows older than 30 days (see src/app/auth/callback/route.ts), which is
-- enough for an app that gets signed into regularly. Admins can also wipe
-- it entirely on demand.
create table login_log (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  email text not null,
  logged_in_at timestamptz not null default now()
);

create index login_log_logged_in_at_idx on login_log(logged_in_at);

-- Admin-configurable fallback visibility for unclaimed profiles' fields
-- (§5 of the design doc). One row per field; seeded with the doc's
-- defaults below. No 'groups' option here — a default with no owner to
-- pick specific groups wouldn't mean anything.
create table privacy_defaults (
  field_name text primary key,
  visibility text not null check (visibility in ('everyone', 'admins_only', 'just_me'))
);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from members
    where id = auth.uid() and role in ('admin', 'super_admin')
  );
$$;

create or replace function is_super_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from members
    where id = auth.uid() and role = 'super_admin'
  );
$$;

create or replace function is_group_admin(p_group_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from group_memberships
    where group_id = p_group_id and member_id = auth.uid() and role = 'admin' and status = 'approved'
  );
$$;

-- Creates a group and its creator's admin membership in one step. Runs as
-- definer so the creator's own first group_memberships row doesn't hit the
-- chicken-and-egg problem of "you must already be a group admin to insert
-- an approved admin membership."
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

  insert into group_memberships (group_id, member_id, role, status, approved_by, approved_at)
    values (v_group.id, auth.uid(), 'admin', 'approved', auth.uid(), now());

  return v_group;
end;
$$;

grant execute on function create_group(text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table people enable row level security;
alter table spouses enable row level security;
alter table invites enable row level security;
alter table access_requests enable row level security;
alter table members enable row level security;
alter table groups enable row level security;
alter table group_memberships enable row level security;
alter table field_privacy enable row level security;
alter table field_privacy_groups enable row level security;
alter table contact_details enable row level security;
alter table contact_detail_groups enable row level security;
alter table pending_changes enable row level security;
alter table audit_log enable row level security;
alter table login_log enable row level security;
alter table privacy_defaults enable row level security;

-- people / spouses: any signed-in member can read (field-level privacy is
-- filtered in application code, see src/lib/privacy.ts); only admins can
-- write directly — everyone else must go through pending_changes.
create policy "members can read people" on people
  for select using (auth.role() = 'authenticated');
create policy "admins can write people" on people
  for insert with check (is_admin());
create policy "admins can update people" on people
  for update using (is_admin());
create policy "admins can delete people" on people
  for delete using (is_admin());

create policy "members can read spouses" on spouses
  for select using (auth.role() = 'authenticated');
create policy "admins can write spouses" on spouses
  for insert with check (is_admin());
create policy "admins can update spouses" on spouses
  for update using (is_admin());
create policy "admins can delete spouses" on spouses
  for delete using (is_admin());

-- invites: admins-only for direct table access. First-login provisioning
-- (checking "am I invited?" and creating/reactivating the members row) goes
-- through the accept_invite() function below instead, which runs with
-- elevated privilege for that one narrow purpose — so a brand-new user who
-- isn't an admin yet never needs a standing RLS policy on invites/members.
create policy "admins can read invites" on invites
  for select using (is_admin());
create policy "admins can write invites" on invites
  for insert with check (is_admin());
create policy "admins can update invites" on invites
  for update using (is_admin());
create policy "super admins can delete invites" on invites
  for delete using (is_super_admin());

-- access_requests: any authenticated user (not just an existing member —
-- this is exactly for people who aren't one yet) can submit and read
-- their own request; only admins can read/decide all of them.
create policy "self or admin can read access_requests" on access_requests
  for select using (auth.uid() = auth_user_id or is_admin());
create policy "self can insert own access_request" on access_requests
  for insert with check (auth.uid() = auth_user_id and status = 'pending');
create policy "admin updates access_requests" on access_requests
  for update using (is_admin());

-- members: a user can read their own row (to learn their role); admins can
-- read all. Only admins can update (e.g. revoke); the trigger below stops
-- an admin who isn't a super admin from changing role/person_id/email.
create policy "self or admin can read members" on members
  for select using (auth.uid() = id or is_admin());
create policy "admins can update members" on members
  for update using (is_admin());
create policy "super admin can delete members" on members
  for delete using (is_super_admin());

create or replace function prevent_member_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_super_admin() and (
    new.role is distinct from old.role
    or new.person_id is distinct from old.person_id
    or new.email is distinct from old.email
  ) then
    raise exception 'Only a super admin can change role, person_id, or email on members';
  end if;
  return new;
end;
$$;

create trigger members_block_self_escalation
  before update on members
  for each row execute function prevent_member_privilege_escalation();

-- First-login provisioning (design doc §3). Runs as the definer (bypassing
-- RLS) so it can check the invites table and create/reactivate a members
-- row for a user who, by definition, isn't an admin yet. Only usable by an
-- authenticated session, and only ever acts on that session's own
-- email/user id — never a caller-supplied one.
create or replace function accept_invite()
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := auth.jwt() ->> 'email';
  v_invite invites;
  v_member members;
begin
  if auth.uid() is null or v_email is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_invite from invites
    where email ilike v_email and status <> 'revoked'
    limit 1;

  if v_invite.id is null then
    return null;
  end if;

  insert into members (id, email, name, role, person_id, invite_id, status, last_login_at)
    values (auth.uid(), v_email, v_invite.name, v_invite.role, v_invite.person_id, v_invite.id, 'active', now())
  on conflict (id) do update set
    status = 'active',
    name = excluded.name,
    role = excluded.role,
    person_id = excluded.person_id,
    invite_id = excluded.invite_id,
    last_login_at = now()
  returning * into v_member;

  if v_invite.status <> 'accepted' then
    update invites set status = 'accepted', accepted_at = now() where id = v_invite.id;
  end if;

  return v_member;
end;
$$;

grant execute on function accept_invite() to authenticated;

-- groups: any signed-in member can see the directory (needed so they can
-- find and request to join a group, private ones included — being listed
-- isn't the same as being a member). Any member can create a private
-- group (becoming its admin via create_group()); only an app admin can
-- create a public one. Only a group admin or app admin can update/delete.
create policy "members can read groups" on groups
  for select using (auth.role() = 'authenticated');
create policy "group admin or app admin can update groups" on groups
  for update using (is_group_admin(id) or is_admin());
create policy "group admin or app admin can delete groups" on groups
  for delete using (is_group_admin(id) or is_admin());

-- group_memberships: any signed-in member can read (so a group's roster
-- and pending queue are visible to those who need them; nothing in this
-- row is sensitive by itself). A member can request to join (their own
-- row, landing as pending/member) or leave (delete their own row); a
-- group admin or app admin can add someone directly (pre-approved),
-- approve/reject/promote, or remove anyone.
create policy "members can read group_memberships" on group_memberships
  for select using (auth.role() = 'authenticated');
create policy "self-request or group/app admin can insert membership" on group_memberships
  for insert with check (
    (member_id = auth.uid() and status = 'pending' and role = 'member')
    or is_group_admin(group_id)
    or is_admin()
  );
create policy "group or app admin can update membership" on group_memberships
  for update using (is_group_admin(group_id) or is_admin());
create policy "self or group/app admin can delete membership" on group_memberships
  for delete using (member_id = auth.uid() or is_group_admin(group_id) or is_admin());

-- field_privacy: any signed-in member can read (needed to know what to
-- hide); a member can set their own linked profile's rows, admins can set
-- any (e.g. unclaimed profiles).
create policy "members can read field_privacy" on field_privacy
  for select using (auth.role() = 'authenticated');
create policy "owner or admin can write field_privacy" on field_privacy
  for insert with check (
    is_admin() or person_id in (select person_id from members where id = auth.uid())
  );
create policy "owner or admin can update field_privacy" on field_privacy
  for update using (
    is_admin() or person_id in (select person_id from members where id = auth.uid())
  );
create policy "owner or admin can delete field_privacy" on field_privacy
  for delete using (
    is_admin() or person_id in (select person_id from members where id = auth.uid())
  );

-- field_privacy_groups: any signed-in member can read (needed to compute
-- "am I in one of the allowed groups" when viewing someone else's
-- profile); only the field's owner or an admin can set which groups.
create policy "members can read field_privacy_groups" on field_privacy_groups
  for select using (auth.role() = 'authenticated');
create policy "owner or admin can write field_privacy_groups" on field_privacy_groups
  for insert with check (
    is_admin() or field_privacy_id in (
      select fp.id from field_privacy fp
      join members m on m.person_id = fp.person_id
      where m.id = auth.uid()
    )
  );
create policy "owner or admin can delete field_privacy_groups" on field_privacy_groups
  for delete using (
    is_admin() or field_privacy_id in (
      select fp.id from field_privacy fp
      join members m on m.person_id = fp.person_id
      where m.id = auth.uid()
    )
  );

-- contact_details: any signed-in member can read (visibility per row is
-- filtered in application code, see src/lib/privacy.ts); only the profile
-- owner or an admin can add/edit/remove entries — same self-service model
-- as field_privacy, since this is squarely "my own contact info".
create policy "members can read contact_details" on contact_details
  for select using (auth.role() = 'authenticated');
create policy "owner or admin can insert contact_details" on contact_details
  for insert with check (
    is_admin() or person_id in (select person_id from members where id = auth.uid())
  );
create policy "owner or admin can update contact_details" on contact_details
  for update using (
    is_admin() or person_id in (select person_id from members where id = auth.uid())
  );
create policy "owner or admin can delete contact_details" on contact_details
  for delete using (
    is_admin() or person_id in (select person_id from members where id = auth.uid())
  );

-- contact_detail_groups: same pattern as field_privacy_groups above.
create policy "members can read contact_detail_groups" on contact_detail_groups
  for select using (auth.role() = 'authenticated');
create policy "owner or admin can write contact_detail_groups" on contact_detail_groups
  for insert with check (
    is_admin() or contact_detail_id in (
      select cd.id from contact_details cd
      join members m on m.person_id = cd.person_id
      where m.id = auth.uid()
    )
  );
create policy "owner or admin can delete contact_detail_groups" on contact_detail_groups
  for delete using (
    is_admin() or contact_detail_id in (
      select cd.id from contact_details cd
      join members m on m.person_id = cd.person_id
      where m.id = auth.uid()
    )
  );

-- pending_changes: a member can create and read their own submissions;
-- admins can read/update all (approve/reject/edit-then-approve). A
-- non-admin submission must land as 'pending' — only an admin's later
-- update (the approval action) may move it to approved/rejected.
create policy "member can insert own pending change" on pending_changes
  for insert with check (
    (submitted_by = auth.uid() and status = 'pending') or is_admin()
  );
create policy "member reads own, admin reads all" on pending_changes
  for select using (
    submitted_by = auth.uid() or is_admin()
  );
create policy "admin updates pending changes" on pending_changes
  for update using (is_admin());

-- audit_log: readable by all signed-in members (simplified "history" tab
-- per profile, §6); only admins/the system write to it.
create policy "members can read audit_log" on audit_log
  for select using (auth.role() = 'authenticated');
create policy "admins write audit_log" on audit_log
  for insert with check (is_admin());

-- login_log: admin-only read (who signed in, and when, is sensitive —
-- unlike audit_log's data-change history, this isn't shown to members).
-- Any authenticated session may insert its own row (recorded on every
-- sign-in, see src/app/auth/callback/route.ts) and delete rows older than
-- 30 days as a side effect of that same insert — the age condition in the
-- policy itself is what enforces the rolling retention, not application
-- code, so it holds regardless of who happens to trigger the cleanup. A
-- full manual wipe (any row, not just expired ones) stays admin-only.
create policy "admins read login_log" on login_log
  for select using (is_admin());
create policy "self can insert own login_log row" on login_log
  for insert with check (auth.uid() = member_id);
create policy "anyone authenticated can delete expired login_log rows" on login_log
  for delete using (auth.role() = 'authenticated' and logged_in_at < now() - interval '30 days');
create policy "admin can delete any login_log row" on login_log
  for delete using (is_admin());

-- privacy_defaults: readable by all signed-in members, writable by admins.
create policy "members can read privacy_defaults" on privacy_defaults
  for select using (auth.role() = 'authenticated');
create policy "admins write privacy_defaults" on privacy_defaults
  for insert with check (is_admin());
create policy "admins update privacy_defaults" on privacy_defaults
  for update using (is_admin());

-- ---------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------
-- Default policy: only name and current location (city/country) are shown
-- to everyone; everything else is private until the profile's owner
-- opts in — to "everyone" or to specific groups (see field_privacy /
-- field_privacy_groups above).
insert into privacy_defaults (field_name, visibility) values
  ('birth_date', 'admins_only'),
  ('death_date', 'admins_only'),
  ('place_of_birth', 'admins_only'),
  ('place_of_death', 'admins_only'),
  ('current_location', 'everyone'),
  ('facebook_url', 'admins_only'),
  ('linkedin_url', 'admins_only');

-- Seed the Super Admin invite. Replace the email below if needed before
-- running this — see README.md.
insert into invites (email, name, role, status) values
  ('haseebm@gmail.com', 'Haseeb', 'super_admin', 'pending');
