-- audit_log had SELECT and INSERT policies only — an admin couldn't
-- actually clear it via the app despite the "Clear log" button needing to
-- work. Kept forever otherwise (no auto-expiry, unlike login_log).

create policy "admins delete audit_log" on audit_log
  for delete using (is_admin());
