"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";

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

  let totalCents = 0;
  const lineItems = cart.map((line) => {
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

    totalCents += Math.round(item.price * 100) * line.quantity;

    return {
      catalog_item_id: item.id,
      quantity: line.quantity,
      price_charged: item.price,
      wholesale_cost: item.cost,
    };
  });

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
    metadata: { checkout_session_id: session.id },
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
