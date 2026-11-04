-- One-time-per-fair flag so the return-deadline reminder email (sent by
-- the daily cron, app/api/cron/transition-fairs/route.ts) fires exactly
-- once per fair, robust to a missed cron run on the one calendar day an
-- "exact day match" check would have needed — the reminder still fires
-- the next day it runs, as long as this stays null.
alter table public.fairs
  add column return_reminder_sent_at timestamptz;
