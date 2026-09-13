-- Captures the requester's email at submit time so the approval email
-- (sent from a Server Action, no browser session to read auth.users from
-- directly) has somewhere to send to without an extra admin-API lookup.
alter table public.fair_requests
  add column requested_by_email text;
