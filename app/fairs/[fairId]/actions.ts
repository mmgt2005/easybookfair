"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";

export type CartLine = { catalog_item_id: string; quantity: number };

// Guest checkout for the public storefront — there's no buyer login, so
// this uses the service-role client throughout (both reads and writes),
// the same trust boundary as the admin in-person checkout action, just
// without an authenticated admin session to lean on for RLS since none
// exists here (buyers never sign in).
//
// price_charged/wholesale_cost are snapshotted from catalog_items here, not
// trusted from the client cart, and available-to-sell (allocated minus
// already-completed sales) is re-checked the same way as everywhere else in
// this schema — not a separately-decremented counter.
export async function createGuestCheckout(
  fairId: string,
  cart: CartLine[],
  buyerName: string,
  buyerEmail: string,
) {
  if (!cart.length) {
    throw new Error("Cart is empty");
  }
  if (!buyerName.trim() || !buyerEmail.trim()) {
    throw new Error("Name and email are required");
  }

  const service = createServiceClient();

  const { data: fair } = await service.from("fairs").select("allow_online").eq("id", fairId).single();
  if (!fair?.allow_online) {
    throw new Error("Online ordering isn't available for this fair");
  }

  const catalogItemIds = cart.map((line) => line.catalog_item_id);

  const [
    { data: catalogItems, error: catalogError },
    { data: allocations, error: allocError },
    { data: soldRows, error: soldError },
  ] = await Promise.all([
    service.from("catalog_items").select("id, title, price, cost").in("id", catalogItemIds),
    service
      .from("allocations")
      .select("catalog_item_id, quantity_allocated")
      .eq("fair_id", fairId)
      .in("catalog_item_id", catalogItemIds),
    service
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
      throw new Error(`Only ${available} of "${item.title}" available`);
    }

    totalCents += Math.round(item.price * 100) * line.quantity;

    return {
      catalog_item_id: item.id,
      title: item.title,
      quantity: line.quantity,
      price_charged: item.price,
      wholesale_cost: item.cost,
    };
  });

  if (totalCents <= 0) {
    throw new Error("Total must be greater than zero");
  }

  const { data: session, error: sessionError } = await service
    .from("checkout_sessions")
    .insert({
      fair_id: fairId,
      channel: "online",
      buyer_name: buyerName.trim(),
      buyer_email: buyerEmail.trim(),
      line_items: lineItems,
    })
    .select("id")
    .single();

  if (sessionError) throw new Error(sessionError.message);

  const paymentIntent = await getStripe().paymentIntents.create({
    amount: totalCents,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
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
