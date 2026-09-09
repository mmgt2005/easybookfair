-- Seeds the chart of accounts from docs/spec.md ("Accounting"). These codes
-- are referenced by account_code in journal_lines and are relied on by name
-- elsewhere (settlement close-out, ledger reports), so treat renumbering as
-- a breaking change, not a routine edit.

insert into public.accounts (code, name, type) values
  ('1000', 'Stripe Clearing', 'asset'),
  ('1100', 'Inventory — Unallocated', 'asset'),
  ('1200', 'Inventory — Consigned to Orgs', 'asset'),
  ('1300', 'Accounts Receivable — Orgs', 'asset'),
  ('2000', 'Org Payable', 'liability'),
  ('4000', 'Wholesale Revenue', 'revenue'),
  ('5000', 'Payment Processing Fees', 'expense');
