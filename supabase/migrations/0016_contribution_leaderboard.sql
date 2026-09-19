-- Per-member counts of APPROVED contributions, for the Leaderboard page.
-- Runs as definer because a regular member can't read other members' rows
-- or submissions (RLS), and only aggregate counts leave this function.
-- Super admins are left out entirely — they aren't part of the ranking.
create or replace function contribution_leaderboard()
returns table (member_id uuid, name text, edits bigint, adds bigint)
language sql
security definer
stable
set search_path = public
as $$
  select
    m.id,
    m.name,
    count(*) filter (where pc.change_type = 'edit_person'),
    count(*) filter (where pc.change_type in ('add_person', 'add_relationship'))
  from pending_changes pc
  join members m on m.id = pc.submitted_by
  where pc.status = 'approved'
    and m.role <> 'super_admin'
    and exists (select 1 from members me where me.id = auth.uid() and me.status = 'active')
  group by m.id, m.name;
$$;

revoke all on function contribution_leaderboard() from public;
grant execute on function contribution_leaderboard() to authenticated;
