-- A parent-funded balance for a specific student, scoped to one fair (not
-- carried across fairs/years — docs/spec.md "Buyer payment options": unused
-- balance becomes additional org payout at fair close, so there's no
-- persisting cross-fair buyer identity to maintain). Identity is a plain
-- name/grade/teacher lookup with no login required — mirrors how Scholastic's
-- own eWallet does it (cashier searches by name/grade/teacher, or a roster
-- fallback), which is adequate given book-fair-scale transaction amounts.
create table public.student_wallets (
  id uuid primary key default gen_random_uuid(),
  fair_id uuid not null references public.fairs (id),
  student_name text not null,
  grade text,
  teacher text,
  balance numeric(10, 2) not null default 0 check (balance >= 0),
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Supports the cashier/funding lookup ("does a wallet already exist for
-- this student at this fair?") without a strict uniqueness constraint —
-- same-name collisions are resolved by grade/teacher/a human glancing at
-- the list, not by the database.
create index student_wallets_fair_name_idx on public.student_wallets (fair_id, student_name);

create trigger set_updated_at
  before update on public.student_wallets
  for each row execute function app.set_updated_at();

alter table public.student_wallets enable row level security;

-- Select-only for admins (the wallets management page). All writes
-- (funding, spending, closing out) go through SECURITY DEFINER functions
-- below, not direct table access — the balance invariant only holds if
-- every mutation passes through one of those, same reasoning as
-- `sales`/`journal_entries` having no ad hoc write policy.
create policy "student_wallets_admin_select" on public.student_wallets
  for select
  using (app.is_platform_admin());
