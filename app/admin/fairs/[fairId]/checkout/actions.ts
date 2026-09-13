"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { applyPromotions, type ActivePromotion } from "@/lib/promotions";

export type CartLine = { catalog_item_id: string; quantity: number };

// Creates the checkout_sessions row and the matching PaymentIntent for an
// in-person (reader) sale. Called directly from the client checkout
// component (not a <form action>) since it needs to return the PaymentIntent
// client secret for the Terminal SDK to use — Server Actions can be invoked
// like a plain async function from a "use client" component, not just via
// forms.
//
// price_charged/wholesale_cost are snapshotted from catalog_items here, not
// trusted from the client cart, so a tampered request can't set its own
// price. "Available to sell" (allocated minus already-completed sales) is
// re-checked here too — same reasoning as deallocate_inventory (migration
// 0012): it's derived, not a separately-decremented counter. This isn't
// row-locked the way allocate_inventory is, so two carts finishing at the
// same instant for the last unit of an item could both pass this check —
// acceptable for one reader/one cashier at a time in practice, not safe for
// multiple concurrent checkout stations without adding real locking.
export async function createInPersonCheckout(fairId: string, cart: CartLine[]) {
  await requireAdmin();

  if (!cart.length) {
    throw new Error("Cart is empty");
  }

  const supabase = await createClient();

  const { data: fair } = await supabase
    .from("fairs")
    .select("stripe_terminal_location_id")
    .eq("id", fairId)
    .single();

  if (!fair?.stripe_terminal_location_id) {
    throw new Error("Set up a Terminal reader for this fair first (fair's Edit page)");
  }

  const catalogItemIds = cart.map((line) => line.catalog_item_id);

  const [
    { data: catalogItems, error: catalogError },
    { data: allocations, error: allocError },
    { data: soldRows, error: soldError },
  ] = await Promise.all([
    supabase.from("catalog_items").select("id, title, price, cost").in("id", catalogItemIds),
    supabase
      .from("allocations")
      .select("catalog_item_id, quantity_allocated")
      .eq("fair_id", fairId)
      .in("catalog_item_id", catalogItemIds),
    supabase
      .from("sales")
      .select("catalog_item_id")
      .eq("fair_id", fairId)
      .eq("status", "completed")
      .in("catalog_item_id", catalogItemIds),
  ]);

  if (catalogError) throw new Error(catalogError.message);
  if (allocError) throw new Error(allocError.message);
  if (soldError) throw new Error(soldError.message);

  const soldByItem = new Map<string, number>();
  for (const row of soldRows ?? []) {
    soldByItem.set(row.catalog_item_id, (soldByItem.get(row.catalog_item_id) ?? 0) + 1);
  }
  const allocatedByItem = new Map(
    (allocations ?? []).map((a) => [a.catalog_item_id, a.quantity_allocated]),
  );
  const catalogById = new Map((catalogItems ?? []).map((c) => [c.id, c]));

  for (const line of cart) {
    const item = catalogById.get(line.catalog_item_id);
    if (!item) {
      throw new Error(`Catalog item ${line.catalog_item_id} not found`);
    }
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new Error(`Quantity must be positive for "${item.title}"`);
    }

    const allocated = allocatedByItem.get(line.catalog_item_id) ?? 0;
    const sold = soldByItem.get(line.catalog_item_id) ?? 0;
    const available = allocated - sold;
    if (line.quantity > available) {
      throw new Error(`Only ${available} of "${item.title}" available to sell`);
    }
  }

  // Active, in-window promotions for this fair — applied automatically,
  // same as the public storefront's guest checkout (lib/promotions.ts).
  const nowIso = new Date().toISOString();
  const { data: promotionRows } = await supabase
    .from("promotions")
    .select("id, kind, config, starts_at, ends_at")
    .eq("fair_id", fairId)
    .eq("active", true);
  const activePromotions = (promotionRows ?? []).filter(
    (p) => (!p.starts_at || p.starts_at <= nowIso) && (!p.ends_at || p.ends_at >= nowIso),
  ) as ActivePromotion[];

  const pricedLines = applyPromotions(cart, catalogById, activePromotions);
  const lineItems = pricedLines.map((line) => ({
    ...line,
    title: catalogById.get(line.catalog_item_id)?.title ?? "",
  }));

  const totalCents = lineItems.reduce(
    (sum, line) => sum + Math.round(line.price_charged * 100) * line.quantity,
    0,
  );

  if (totalCents <= 0) {
    throw new Error("Total must be greater than zero");
  }

  // checkout_sessions has no insert/update policy for authenticated users
  // (migration 0010) — writes are service-role only, same trust boundary as
  // the webhook that reads this row back.
  const service = createServiceClient();

  const { data: session, error: sessionError } = await service
    .from("checkout_sessions")
    .insert({ fair_id: fairId, channel: "in_person", line_items: lineItems })
    .select("id")
    .single();

  if (sessionError) throw new Error(sessionError.message);

  const paymentIntent = await getStripe().paymentIntents.create({
    amount: totalCents,
    currency: "usd",
    payment_method_types: ["card_present"],
    capture_method: "automatic",
    metadata: { checkout_session_id: session.id, kind: "checkout_session" },
  });

  const { error: updateError } = await service
    .from("checkout_sessions")
    .update({ payment_intent_id: paymentIntent.id })
    .eq("id", session.id);

  if (updateError) throw new Error(updateError.message);

  return {
    checkoutSessionId: session.id as string,
    clientSecret: paymentIntent.client_secret as string,
  };
}

// Polled by the client after Terminal reports the payment collected — the
// actual sales/ledger rows are written asynchronously by the
// payment_intent.succeeded webhook, not synchronously in this request.
export async function getCheckoutSessionStatus(checkoutSessionId: string) {
  await requireAdmin();
  const service = createServiceClient();

  const { data, error } = await service
    .from("checkout_sessions")
    .select("status")
    .eq("id", checkoutSessionId)
    .single();

  if (error) throw new Error(error.message);
  return data.status as string;
}

export type WalletMatch = {
  id: string;
  student_name: string;
  grade: string | null;
  teacher: string | null;
  balance: number;
};

// Looks up active wallets for this fair by student name — mirrors how
// Scholastic's own cashier tool works (name/grade/teacher lookup, no
// login), not a strict single-match search since duplicate names are
// resolved by a human glancing at grade/teacher.
export async function searchWallets(fairId: string, query: string): Promise<WalletMatch[]> {
  await requireAdmin();
  if (!query.trim()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_wallets")
    .select("id, student_name, grade, teacher, balance")
    .eq("fair_id", fairId)
    .eq("status", "active")
    .ilike("student_name", `%${query.trim()}%`)
    .order("student_name")
    .limit(10);

  if (error) throw new Error(error.message);
  return data as WalletMatch[];
}

// Spends from a student wallet — a third tender alongside the reader and
// cash, using the same cart the admin already built. Unlike the reader
// path, this settles synchronously (no webhook involved — spend_from_wallet
// writes the sales/ledger rows directly), so there's nothing to poll.
//
// Promotions are computed here (not inside spend_from_wallet itself) for
// the same reason the guest/in-person checkout actions compute them in
// TypeScript rather than SQL: lib/promotions.ts is shared, tested logic,
// not duplicated across a third PL/pgSQL implementation. spend_from_wallet
// (migration 0039) accepts the resulting price_charged/promotion_id per
// line instead of always pricing from catalog_items itself.
export async function chargeWallet(fairId: string, walletId: string, cart: CartLine[]) {
  await requireAdmin();
  if (!cart.length) {
    throw new Error("Cart is empty");
  }

  const supabase = await createClient();

  const catalogItemIds = cart.map((line) => line.catalog_item_id);
  const { data: catalogItems, error: catalogError } = await supabase
    .from("catalog_items")
    .select("id, title, price, cost")
    .in("id", catalogItemIds);
  if (catalogError) throw new Error(catalogError.message);

  const catalogById = new Map((catalogItems ?? []).map((c) => [c.id, c]));

  const nowIso = new Date().toISOString();
  const { data: promotionRows } = await supabase
    .from("promotions")
    .select("id, kind, config, starts_at, ends_at")
    .eq("fair_id", fairId)
    .eq("active", true);
  const activePromotions = (promotionRows ?? []).filter(
    (p) => (!p.starts_at || p.starts_at <= nowIso) && (!p.ends_at || p.ends_at >= nowIso),
  ) as ActivePromotion[];

  const pricedLines = applyPromotions(cart, catalogById, activePromotions);

  const { error } = await supabase.rpc("spend_from_wallet", {
    p_wallet_id: walletId,
    p_fair_id: fairId,
    p_line_items: pricedLines,
  });

  if (error) throw new Error(error.message);
}
