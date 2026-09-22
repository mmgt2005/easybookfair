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
  cashRevenue: number;
  walletDonations: number;
  payout: number;
  payoutIsFinal: boolean;
  missingInventoryCost: number;
  missingInventoryUnits: number;
};

type PayoutEstimate = {
  payout: number;
  payoutIsFinal: boolean;
  missingInventoryCost: number;
  missingInventoryUnits: number;
};

// The headline "payout" is deliberately sales-only — it never deducts for
// inventory that isn't back yet. Reason: allocated - returned - sold
// treats every unit still legitimately out for sale as "missing," which
// during a scheduled/active fair is most of the allocation (nothing's
// wrong, the fair just isn't over). Folding that into the one payout
// number made it look artificially low or negative before the fair even
// ended. missing_inventory_cost is still computed and returned
// separately, so the UI can show it as its own "if not returned" risk
// note rather than silently baked into the payout — exactly what
// close_fair() (migration 0036, extended by 0055) will actually charge
// if the fair closes with that inventory still unreturned. Once actually
// closed, the real settlements row is authoritative for both figures
// (payout and missing-inventory are both real then, not a risk anymore).
async function getPayoutEstimate(
  fairId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<PayoutEstimate> {
  const { data: settlement } = await supabase
    .from("settlements")
    .select("net_payout, missing_inventory_cost")
    .eq("fair_id", fairId)
    .maybeSingle();

  if (settlement) {
    return {
      payout: settlement.net_payout,
      payoutIsFinal: true,
      missingInventoryCost: settlement.missing_inventory_cost,
      missingInventoryUnits: 0,
    };
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
  let missingInventoryUnits = 0;
  for (const a of allocations ?? []) {
    const cost = (a.catalog_items as unknown as { cost: number } | null)?.cost ?? 0;
    const sold = soldByItem.get(a.catalog_item_id) ?? 0;
    const missingUnits = Math.max(a.quantity_allocated - a.quantity_returned - sold, 0);
    missingInventoryCost += missingUnits * cost;
    missingInventoryUnits += missingUnits;
  }

  const rentalFee = fair?.equipment_rental_fee ?? 0;
  const payout = payoutDue - (cashWholesaleOwed + rentalFee);

  return { payout, payoutIsFinal: false, missingInventoryCost, missingInventoryUnits };
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
    { data: wallets, error: walletsError },
    { data: pool },
    { payout, payoutIsFinal, missingInventoryCost, missingInventoryUnits },
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
      .select("channel, price_charged")
      .eq("fair_id", fairId)
      .eq("status", "completed"),
    supabase.from("student_wallets").select("donated_amount").eq("fair_id", fairId),
    supabase.from("wallet_pools").select("swept_amount").eq("fair_id", fairId).maybeSingle(),
    getPayoutEstimate(fairId, supabase),
  ]);

  if (rowsError) throw new Error(rowsError.message);
  if (totalsError) throw new Error(totalsError.message);
  if (walletsError) throw new Error(walletsError.message);

  const sales: SaleRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    title: (r.catalog_items as unknown as { title: string } | null)?.title ?? "Unknown item",
    channel: r.channel,
    price_charged: r.price_charged,
    sold_at: r.sold_at,
  }));

  const totalUnits = (totals ?? []).length;
  const totalRevenue = (totals ?? []).reduce((sum, t) => sum + t.price_charged, 0);
  // Cash sales are the only channel the org physically holds the money for
  // right away — card/online/wallet all settle through Stripe into the
  // payout above instead. Broken out here so it's clear this portion of
  // revenue isn't something the org is still waiting to receive.
  const cashRevenue = (totals ?? [])
    .filter((t) => t.channel === "cash")
    .reduce((sum, t) => sum + t.price_charged, 0);

  // Set once by close_wallets_for_fair() (migration 0022, extended by
  // 0037/0046/0059) when a wallet with unspent balance is closed out, or
  // when the fair's wallet assistance pool has unused balance at close
  // (migration 0059/0060) — both post a debit-liability/credit-2000
  // journal entry at that moment, so this money is already inside
  // payoutDue/the payout above, unlike cash revenue. Broken out here
  // just so it's visible where part of the payout actually came from.
  const walletDonations =
    (wallets ?? []).reduce((sum, w) => sum + w.donated_amount, 0) +
    Number(pool?.swept_amount ?? 0);

  return {
    sales,
    totalUnits,
    totalRevenue,
    cashRevenue,
    walletDonations,
    payout,
    payoutIsFinal,
    missingInventoryCost,
    missingInventoryUnits,
  };
}
