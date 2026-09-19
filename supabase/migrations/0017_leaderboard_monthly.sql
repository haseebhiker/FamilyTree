-- Adds a "this month" option to the leaderboard function from 0016.
-- p_monthly = true counts only changes approved since the 1st of the
-- current month (Pacific time); false counts everything ever.
drop function if exists contribution_leaderboard();

create or replace function contribution_leaderboard(p_monthly boolean default false)
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
    and (
      not p_monthly
      or pc.reviewed_at >= date_trunc('month', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles'
    )
    and exists (select 1 from members me where me.id = auth.uid() and me.status = 'active')
  group by m.id, m.name;
$$;

revoke all on function contribution_leaderboard(boolean) from public;
grant execute on function contribution_leaderboard(boolean) to authenticated;
