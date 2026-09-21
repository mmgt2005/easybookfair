"use server";

import { createClient } from "@/lib/supabase/server";
import { requireFairStaff } from "@/lib/auth";

export type SaleRow = {
  id: string;
  title: string;
  channel: string;
  price_charged: number;
  sold_at: string;
};

export type RecentSales = {
  sales: SaleRow[];
  totalUnits: number;
  totalRevenue: number;
  payout: number;
  payoutIsFinal: boolean;
};

// Mirrors close_fair()'s own math exactly (migration 0036, extended by
// 0055) — payout_due is the credit balance of Org Payable (2000),
// cash_wholesale_owed is the debit balance of A/R (1300), both scoped to
// this fair; missing_inventory_cost is computed the same way
// close_fair() computes it (allocated - returned - sold, clamped at 0,
// times each item's current cost); net payout is payout_due minus
// (cash_wholesale_owed + missing_inventory_cost + equipment_rental_fee).
// This is a live read, not a write: nothing is inserted, so it stays
// accurate as more sales/returns land and reads the exact number closing
// the fair would lock in today. Once the fair has actually closed, the
// real settlements row (which can differ slightly if, say, wallets were
// closed out between this read and that one) is authoritative instead.
async function getPayoutEstimate(
  fairId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ payout: number; payoutIsFinal: boolean }> {
  const { data: settlement } = await supabase
    .from("settlements")
    .select("net_payout")
    .eq("fair_id", fairId)
    .maybeSingle();

  if (settlement) {
    return { payout: settlement.net_payout, payoutIsFinal: true };
  }

  const [{ data: fair }, { data: lines }, { data: allocations }, { data: soldRows }] =
    await Promise.all([
      supabase.from("fairs").select("equipment_rental_fee").eq("id", fairId).single(),
      supabase
        .from("journal_lines")
        .select("account_code, debit, credit, journal_entries!inner(fair_id)")
        .eq("journal_entries.fair_id", fairId)
        .in("account_code", ["2000", "1300"]),
      supabase
        .from("allocations")
        .select("catalog_item_id, quantity_allocated, quantity_returned, catalog_items(cost)")
        .eq("fair_id", fairId),
      supabase
        .from("sales")
        .select("catalog_item_id")
        .eq("fair_id", fairId)
        .eq("status", "completed"),
    ]);

  let payoutDue = 0;
  let cashWholesaleOwed = 0;
  for (const line of lines ?? []) {
    if (line.account_code === "2000") {
      payoutDue += line.credit - line.debit;
    } else if (line.account_code === "1300") {
      cashWholesaleOwed += line.debit - line.credit;
    }
  }
  payoutDue = Math.max(payoutDue, 0);
  cashWholesaleOwed = Math.max(cashWholesaleOwed, 0);

  const soldByItem = new Map<string, number>();
  for (const sale of soldRows ?? []) {
    soldByItem.set(sale.catalog_item_id, (soldByItem.get(sale.catalog_item_id) ?? 0) + 1);
  }
  let missingInventoryCost = 0;
  for (const a of allocations ?? []) {
    const cost = (a.catalog_items as unknown as { cost: number } | null)?.cost ?? 0;
    const sold = soldByItem.get(a.catalog_item_id) ?? 0;
    const missingUnits = Math.max(a.quantity_allocated - a.quantity_returned - sold, 0);
    missingInventoryCost += missingUnits * cost;
  }

  const rentalFee = fair?.equipment_rental_fee ?? 0;
  const payout = payoutDue - (cashWholesaleOwed + missingInventoryCost + rentalFee);

  return { payout, payoutIsFinal: false };
}

// Polled by SalesFeedClient every few seconds — a "live" feed built on
// polling rather than Supabase Realtime, consistent with how this app
// already handles "wait for something to happen" elsewhere (the checkout
// screen's own completion poll) instead of taking on a websocket
// dependency for a book-fair-scale volume of sales.
//
// Returns the most recent sales fresh each call (not "sales since X") —
// the client diffs by id itself. That sidesteps any risk of a cursor
// based on sold_at missing or double-counting a row when two sales land
// in the same instant (record_cash_sale/spend_from_wallet insert one row
// per unit in a tight loop), which a `sold_at > since` cursor can't
// guarantee against.
export async function getRecentSales(fairId: string): Promise<RecentSales> {
  await requireFairStaff(fairId);
  const supabase = await createClient();

  const [
    { data: rows, error: rowsError },
    { data: totals, error: totalsError },
    { payout, payoutIsFinal },
  ] = await Promise.all([
    supabase
      .from("sales")
      .select("id, catalog_item_id, channel, price_charged, sold_at, catalog_items(title)")
      .eq("fair_id", fairId)
      .eq("status", "completed")
      .order("sold_at", { ascending: false })
      .limit(30),
    supabase
      .from("sales")
      .select("price_charged")
      .eq("fair_id", fairId)
      .eq("status", "completed"),
    getPayoutEstimate(fairId, supabase),
  ]);

  if (rowsError) throw new Error(rowsError.message);
  if (totalsError) throw new Error(totalsError.message);

  const sales: SaleRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    title: (r.catalog_items as unknown as { title: string } | null)?.title ?? "Unknown item",
    channel: r.channel,
    price_charged: r.price_charged,
    sold_at: r.sold_at,
  }));

  const totalUnits = (totals ?? []).length;
  const totalRevenue = (totals ?? []).reduce((sum, t) => sum + t.price_charged, 0);

  return { sales, totalUnits, totalRevenue, payout, payoutIsFinal };
}
