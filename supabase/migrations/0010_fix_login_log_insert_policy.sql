-- The live login_log INSERT policy stopped matching what's in schema.sql
-- at some point today (cause unknown — never directly diagnosable without
-- a raw SQL connection, which this app doesn't keep). Confirmed directly:
-- a real, freshly-authenticated member whose auth.uid() exactly equals the
-- member_id they're inserting still gets "new row violates row-level
-- security policy for table login_log" — which the documented policy
-- (auth.uid() = member_id) would never produce. This is why sign-ins
-- since roughly today 19:13 UTC never got a login_log row even though the
-- sign-in itself succeeded (members.last_login_at kept updating fine —
-- that happens inside accept_invite() itself, unrelated to this insert).
--
-- Recreates all four login_log policies from schema.sql to guarantee a
-- known-good state, not just the one proven broken.
drop policy if exists "admins read login_log" on login_log;
drop policy if exists "self can insert own login_log row" on login_log;
drop policy if exists "anyone authenticated can delete expired login_log rows" on login_log;
drop policy if exists "admin can delete any login_log row" on login_log;

create policy "admins read login_log" on login_log
  for select using (is_admin());
create policy "self can insert own login_log row" on login_log
  for insert with check (auth.uid() = member_id);
create policy "anyone authenticated can delete expired login_log rows" on login_log
  for delete using (auth.role() = 'authenticated' and logged_in_at < now() - interval '30 days');
create policy "admin can delete any login_log row" on login_log
  for delete using (is_admin());
