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
  date_of_birth text,
  birth_year int,
  date_of_death text,
  death_year int,
  place_of_birth text,
  place_of_death text,
  current_location text,
  photo_url text,
  bio text,
  facebook_url text,
  linkedin_url text,
  legacy_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- Per-field privacy setting, set by the profile owner (or an admin for
-- unclaimed profiles). Absence of a row = the field-specific default
-- applied in application code (see src/lib/privacy.ts).
create table field_privacy (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  field_name text not null check (field_name in (
    'date_of_birth', 'date_of_death',
    'current_location', 'facebook_url', 'linkedin_url',
    'place_of_birth', 'place_of_death'
  )),
  visibility text not null check (visibility in ('everyone', 'admins_only', 'just_me')),
  updated_at timestamptz not null default now(),
  unique (person_id, field_name)
);

-- Contact details (phone/email/address) — a person can have several of
-- each (e.g. two mobile numbers), so these live in their own table rather
-- than single columns on people. Each entry carries its own visibility
-- rather than sharing one field-level setting, since e.g. a work phone and
-- a personal phone might reasonably get different audiences.
create table contact_details (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  contact_type text not null check (contact_type in ('phone', 'email', 'address')),
  label text,
  value text not null,
  visibility text not null default 'admins_only' check (visibility in ('everyone', 'admins_only', 'just_me')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contact_details_person_idx on contact_details(person_id);

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

-- Admin-configurable fallback visibility for unclaimed profiles' fields
-- (§5 of the design doc). One row per field; seeded with the doc's
-- defaults below.
create table privacy_defaults (
  field_name text primary key,
  visibility text not null check (visibility in ('everyone', 'admins_only', 'just_me'))
);

-- ---------------------------------------------------------------------------
-- Helper: is the current authenticated user an admin (or super admin)?
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

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table people enable row level security;
alter table spouses enable row level security;
alter table field_privacy enable row level security;
alter table contact_details enable row level security;
alter table invites enable row level security;
alter table members enable row level security;
alter table pending_changes enable row level security;
alter table audit_log enable row level security;
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
insert into privacy_defaults (field_name, visibility) values
  ('date_of_birth', 'everyone'),
  ('date_of_death', 'everyone'),
  ('place_of_birth', 'everyone'),
  ('place_of_death', 'everyone'),
  ('current_location', 'admins_only'),
  ('facebook_url', 'admins_only'),
  ('linkedin_url', 'admins_only');

-- Seed the Super Admin invite. Replace the email below if needed before
-- running this — see README.md.
insert into invites (email, name, role, status) values
  ('haseebm@gmail.com', 'Haseeb', 'super_admin', 'pending');
