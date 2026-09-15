-- Fixes the bug that wiped a member's person_id back to null on a
-- returning sign-in: the upsert set person_id = the invite's own
-- person_id unconditionally, but an invite's person_id is normally only
-- set at invite creation — linking someone to their profile LATER (the
-- "Linked profile" flow in Invite Management) only ever updated the
-- members row, never the original invite. Preserves whatever the member
-- already has (coalesce) instead of overwriting it, so this is safe to
-- call on every sign-in going forward.
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
    person_id = coalesce(members.person_id, excluded.person_id),
    invite_id = excluded.invite_id,
    last_login_at = now()
  returning * into v_member;

  if v_invite.status <> 'accepted' then
    update invites set status = 'accepted', accepted_at = now() where id = v_invite.id;
  end if;

  return v_member;
end;
$$;
