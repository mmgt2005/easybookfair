import type { createClient } from "@/lib/supabase/server";
import type { LedgerFilters } from "@/lib/ledger";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type SalesExportRow = {
  id: string;
  soldAt: string;
  fairName: string;
  orgName: string;
  itemTitle: string;
  channel: string;
  priceCharged: number;
  wholesaleCost: number;
};

// Itemized sales across every fair/org matching the filter — extends the
// payout report's own single-fair itemized-sales query
// (PayoutReportContent.tsx) to be filterable by date range/org/fair
// instead of pinned to one fairId, closing the "payout report is
// per-fair only" gap.
export async function getItemizedSales(
  supabase: Supabase,
  filters: LedgerFilters,
): Promise<SalesExportRow[]> {
  let query = supabase
    .from("sales")
    .select(
      "id, sold_at, channel, price_charged, wholesale_cost, catalog_items(title), fairs!inner(name, org_id, organizations(name))",
    )
    .eq("status", "completed");

  if (filters.start) query = query.gte("sold_at", filters.start);
  if (filters.end) query = query.lte("sold_at", filters.end);
  if (filters.fairId) query = query.eq("fair_id", filters.fairId);
  // fairs!inner above is required for this embedded-column filter to
  // actually restrict rows, same reasoning as the journal_entries!inner
  // filters in lib/ledger.ts.
  if (filters.orgId) query = query.eq("fairs.org_id", filters.orgId);

  const { data } = await query.order("sold_at", { ascending: true });

  return (data ?? []).map((r) => {
    const fair = r.fairs as unknown as { name: string; organizations: { name: string } | null };
    return {
      id: r.id,
      soldAt: r.sold_at,
      fairName: fair.name,
      orgName: fair.organizations?.name ?? "",
      itemTitle: (r.catalog_items as unknown as { title: string } | null)?.title ?? "Unknown item",
      channel: r.channel,
      priceCharged: r.price_charged,
      wholesaleCost: r.wholesale_cost,
    };
  });
}

export type SalesTaxSummaryRow = {
  fairId: string;
  fairName: string;
  orgName: string;
  taxState: string | null;
  combinedRatePct: number | null;
  salesTaxCollected: number;
};

// A per-fair rollup of sales tax collected (account 2100, same
// credit-debit convention getPayoutEstimate() already uses for it),
// grouped across every fair matching the filter — closes the
// "no cross-fair sales-tax-by-jurisdiction total" gap; this is the
// number an accountant actually needs for remittance.
export async function getSalesTaxSummary(
  supabase: Supabase,
  filters: LedgerFilters,
): Promise<SalesTaxSummaryRow[]> {
  let query = supabase
    .from("journal_lines")
    .select("debit, credit, journal_entries!inner(fair_id, org_id, posted_at)")
    .eq("account_code", "2100");

  if (filters.start) query = query.gte("journal_entries.posted_at", filters.start);
  if (filters.end) query = query.lte("journal_entries.posted_at", filters.end);
  if (filters.orgId) query = query.eq("journal_entries.org_id", filters.orgId);
  if (filters.fairId) query = query.eq("journal_entries.fair_id", filters.fairId);

  const { data: lines } = await query;

  const totals = new Map<string, number>();
  for (const line of lines ?? []) {
    const entry = line.journal_entries as unknown as { fair_id: string | null };
    // Sales tax is always posted with a fair_id in practice (every
    // posting path threads p_fair_id through) — skipped defensively
    // rather than grouped under a fake key if that ever weren't true.
    if (!entry.fair_id) continue;
    totals.set(entry.fair_id, (totals.get(entry.fair_id) ?? 0) + (line.credit - line.debit));
  }

  const fairIds = [...totals.keys()];
  if (fairIds.length === 0) return [];

  const { data: fairs } = await supabase
    .from("fairs")
    .select("id, name, tax_state, sales_tax_pct, organizations(name)")
    .in("id", fairIds);

  return (fairs ?? [])
    .map((f) => ({
      fairId: f.id,
      fairName: f.name,
      orgName: (f.organizations as unknown as { name: string } | null)?.name ?? "",
      taxState: f.tax_state,
      combinedRatePct: f.sales_tax_pct,
      salesTaxCollected: Math.max(totals.get(f.id) ?? 0, 0),
    }))
    .sort((a, b) => a.fairName.localeCompare(b.fairName));
}
