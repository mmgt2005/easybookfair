-- accounts ---------------------------------------------------------

create table public.accounts (
  code text primary key,
  name text not null,
  type public.account_type not null,
  created_at timestamptz not null default now()
);

-- journal_entries / journal_lines ---------------------------------------------------------

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  -- e.g. 'allocation', 'sale', 'fee', 'refund', 'payout', 'org_payment',
  -- 'return', 'missing_inventory', 'settlement_adjustment'
  entry_type text not null,
  fair_id uuid references public.fairs (id),
  org_id uuid references public.organizations (id),
  description text,
  -- Polymorphic pointer (sales.id, settlements.id, ...) — intentionally not
  -- FK-constrained since it can reference different tables by entry_type.
  reference_id uuid,
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index journal_entries_fair_id_idx on public.journal_entries (fair_id);
create index journal_entries_org_id_idx on public.journal_entries (org_id);

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries (id) on delete cascade,
  account_code text not null references public.accounts (code),
  debit numeric(12, 2) not null default 0 check (debit >= 0),
  credit numeric(12, 2) not null default 0 check (credit >= 0),
  created_at timestamptz not null default now(),
  check (debit = 0 or credit = 0),
  check (debit > 0 or credit > 0)
);

create index journal_lines_journal_entry_id_idx on public.journal_lines (journal_entry_id);
create index journal_lines_account_code_idx on public.journal_lines (account_code);

-- Balance enforcement -----------------------------------------------------
-- Belt-and-suspenders: app.post_journal_entry() below is the intended way
-- to post an entry and rejects unbalanced lines up front, but this deferred
-- constraint trigger enforces the same invariant directly on journal_lines
-- so it holds no matter what writes the row (docs/spec.md tradeoff note on
-- keeping ledger invariants in the database rather than only in app code).

create or replace function app.check_journal_entry_balance()
returns trigger
language plpgsql
as $$
declare
  v_entry_id uuid;
  v_total_debit numeric(14, 2);
  v_total_credit numeric(14, 2);
begin
  v_entry_id := coalesce(new.journal_entry_id, old.journal_entry_id);

  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
  into v_total_debit, v_total_credit
  from public.journal_lines
  where journal_entry_id = v_entry_id;

  if v_total_debit <> v_total_credit then
    raise exception 'journal entry % is not balanced: debits % <> credits %',
      v_entry_id, v_total_debit, v_total_credit;
  end if;

  return null;
end;
$$;

create constraint trigger journal_lines_balance_check
  after insert or update or delete on public.journal_lines
  deferrable initially deferred
  for each row execute function app.check_journal_entry_balance();

-- Convenience function for posting a balanced entry in one call. Validates
-- the lines balance *before* touching the table, so a mistake fails with a
-- clear message instead of surfacing as a deferred-trigger error at commit.
create or replace function app.post_journal_entry(
  p_entry_type text,
  p_fair_id uuid,
  p_org_id uuid,
  p_description text,
  p_reference_id uuid,
  -- jsonb array of {"account_code": "1000", "debit": 12.34, "credit": 0}
  p_lines jsonb
) returns uuid
language plpgsql
as $$
declare
  v_entry_id uuid;
  v_total_debit numeric(14, 2);
  v_total_credit numeric(14, 2);
  v_line jsonb;
begin
  select
    coalesce(sum((l ->> 'debit')::numeric), 0),
    coalesce(sum((l ->> 'credit')::numeric), 0)
  into v_total_debit, v_total_credit
  from jsonb_array_elements(p_lines) as l;

  if v_total_debit <> v_total_credit then
    raise exception 'journal entry not balanced: debits % <> credits %', v_total_debit, v_total_credit;
  end if;

  if v_total_debit = 0 then
    raise exception 'journal entry has no lines';
  end if;

  insert into public.journal_entries (entry_type, fair_id, org_id, description, reference_id)
  values (p_entry_type, p_fair_id, p_org_id, p_description, p_reference_id)
  returning id into v_entry_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into public.journal_lines (journal_entry_id, account_code, debit, credit)
    values (
      v_entry_id,
      v_line ->> 'account_code',
      coalesce((v_line ->> 'debit')::numeric, 0),
      coalesce((v_line ->> 'credit')::numeric, 0)
    );
  end loop;

  return v_entry_id;
end;
$$;

-- settlements ---------------------------------------------------------
-- One row per fair (a fair belongs to exactly one org, so fair_id unique is
-- equivalent to "one row per fair, per org" from docs/spec.md). The two
-- check constraints pin the net-payout formula in the database itself,
-- rather than trusting every caller to compute it consistently.

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  fair_id uuid not null unique references public.fairs (id),
  org_id uuid not null references public.organizations (id),
  cash_wholesale_owed numeric(12, 2) not null default 0,
  missing_inventory_cost numeric(12, 2) not null default 0,
  total_owed_by_org numeric(12, 2) not null default 0,
  payout_due numeric(12, 2) not null default 0,
  net_payout numeric(12, 2) not null default 0,
  journal_entry_id uuid references public.journal_entries (id),
  stripe_transfer_id text,
  stripe_payment_link_id text,
  closed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (total_owed_by_org = cash_wholesale_owed + missing_inventory_cost),
  check (net_payout = payout_due - total_owed_by_org)
);

create index settlements_org_id_idx on public.settlements (org_id);
