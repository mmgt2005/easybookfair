-- Money loaded into a student wallet but not yet spent is owed back in the
-- form of goods — same accounting shape as a retail gift card liability,
-- distinct from Org Payable (which only exists once a sale has happened).
insert into public.accounts (code, name, type) values
  ('1400', 'Buyer Wallet Liability', 'liability');
