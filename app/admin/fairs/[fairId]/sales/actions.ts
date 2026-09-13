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
};

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

  const [{ data: rows, error: rowsError }, { data: totals, error: totalsError }] =
    await Promise.all([
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

  return { sales, totalUnits, totalRevenue };
}
