-- Tracks the last time a manual reminder email went out to an invite that
-- hasn't signed in yet, so the composer can show "already sent" instead of
-- leaving it a guess.
alter table invites add column if not exists last_reminder_sent_at timestamptz;
