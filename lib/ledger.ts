import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type LedgerFilters = {
  start?: string; // ISO date, inclusive (compared against journal_entries.posted_at)
  end?: string; // ISO date, inclusive
  orgId?: string;
  fairId?: string;
};

export type TrialBalanceRow = {
  code: string;
  name: string;
  type: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
};

export type LedgerTransactionRow = {
  id: string;
  journalEntryId: string;
  accountCode: string;
  accountName: string;
  entryType: string;
  description: string | null;
  postedAt: string;
  fairName: string | null;
  orgName: string | null;
  debit: number;
  credit: number;
  referenceId: string | null;
};

// Assets/expenses carry a normal debit balance (debit increases them);
// liabilities/equity/revenue carry a normal credit balance. Same
// convention already applied per-account-code in getPayoutEstimate()
// (app/admin/fairs/[fairId]/sales/actions.ts) and close_fair()
// (supabase/migrations/0064_sales_tax.sql), generalized here by
// accounts.type so it covers the whole chart, not just 2000/1300/2100.
function accountBalance(type: string, totalDebit: number, totalCredit: number): number {
  return type === "asset" || type === "expense" ? totalDebit - totalCredit : totalCredit - totalDebit;
}

// The "current balances" view — every account in the chart, even one with
// zero activity in the filtered window (so the full chart is always
// visible), with totals narrowed by whichever of start/end/orgId/fairId
// are present. Omitting all four returns the complete, all-time,
// all-organization trial balance.
export async function getTrialBalance(
  supabase: Supabase,
  filters: LedgerFilters,
): Promise<TrialBalanceRow[]> {
  let linesQuery = supabase
    .from("journal_lines")
    .select("account_code, debit, credit, journal_entries!inner(posted_at, org_id, fair_id)");
  // journal_entries!inner(...) above is required (not a plain left-embed)
  // so that filtering on its columns actually restricts which
  // journal_lines rows come back, rather than just nulling out the embed
  // for non-matching rows — same reasoning as getPayoutEstimate()'s own
  // journal_entries!inner(fair_id) filter.
  if (filters.start) linesQuery = linesQuery.gte("journal_entries.posted_at", filters.start);
  if (filters.end) linesQuery = linesQuery.lte("journal_entries.posted_at", filters.end);
  if (filters.orgId) linesQuery = linesQuery.eq("journal_entries.org_id", filters.orgId);
  if (filters.fairId) linesQuery = linesQuery.eq("journal_entries.fair_id", filters.fairId);

  const [{ data: accounts }, { data: lines }] = await Promise.all([
    supabase.from("accounts").select("code, name, type").order("code"),
    linesQuery,
  ]);

  const totals = new Map<string, { debit: number; credit: number }>();
  for (const line of lines ?? []) {
    const t = totals.get(line.account_code) ?? { debit: 0, credit: 0 };
    t.debit += line.debit;
    t.credit += line.credit;
    totals.set(line.account_code, t);
  }

  return (accounts ?? []).map((a) => {
    const t = totals.get(a.code) ?? { debit: 0, credit: 0 };
    return {
      code: a.code,
      name: a.name,
      type: a.type,
      totalDebit: t.debit,
      totalCredit: t.credit,
      balance: accountBalance(a.type, t.debit, t.credit),
    };
  });
}

// The actual posted debit/credit lines, optionally narrowed to one
// account — this is the general ledger itself. No .limit() (mirrors the
// payout report's own "unlimited, this is a report not a live feed"
// convention): a school-fundraiser platform's annual transaction count is
// realistically in the thousands, not millions, so fetch-all-then-sort-
// in-JS is consistent with how getRecentSales()/the admin dashboard
// already operate, without building new DB-side pagination for a volume
// this app doesn't have. Sorted ascending (chronological, "report-reading
// order") — callers that want most-recent-first (the on-screen view)
// reverse the result themselves.
export async function getLedgerTransactions(
  supabase: Supabase,
  filters: LedgerFilters & { accountCode?: string },
): Promise<LedgerTransactionRow[]> {
  let query = supabase
    .from("journal_lines")
    .select(
      "id, debit, credit, account_code, accounts(name), journal_entries!inner(id, entry_type, description, posted_at, reference_id, fair_id, org_id, fairs(name), organizations(name))",
    );
  if (filters.start) query = query.gte("journal_entries.posted_at", filters.start);
  if (filters.end) query = query.lte("journal_entries.posted_at", filters.end);
  if (filters.orgId) query = query.eq("journal_entries.org_id", filters.orgId);
  if (filters.fairId) query = query.eq("journal_entries.fair_id", filters.fairId);
  if (filters.accountCode) query = query.eq("account_code", filters.accountCode);

  const { data } = await query;

  const rows: LedgerTransactionRow[] = (data ?? []).map((r) => {
    const entry = r.journal_entries as unknown as {
      id: string;
      entry_type: string;
      description: string | null;
      posted_at: string;
      reference_id: string | null;
      fairs: { name: string } | null;
      organizations: { name: string } | null;
    };
    return {
      id: r.id,
      journalEntryId: entry.id,
      accountCode: r.account_code,
      accountName: (r.accounts as unknown as { name: string } | null)?.name ?? r.account_code,
      entryType: entry.entry_type,
      description: entry.description,
      postedAt: entry.posted_at,
      fairName: entry.fairs?.name ?? null,
      orgName: entry.organizations?.name ?? null,
      debit: r.debit,
      credit: r.credit,
      referenceId: entry.reference_id,
    };
  });

  rows.sort((a, b) => a.postedAt.localeCompare(b.postedAt));
  return rows;
}
