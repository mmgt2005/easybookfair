"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireFairStaff } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import {
  applyPromotions,
  isPromotionInWindow,
  type ActivePromotion,
} from "@/lib/promotions";
import { sendOrderConfirmationEmail, siteUrl } from "@/lib/email";
import { qrCodeDataUrl } from "@/lib/qr";

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
export async function createInPersonCheckout(
  fairId: string,
  cart: CartLine[],
  buyerEmail?: string,
) {
  await requireFairStaff(fairId);

  if (!cart.length) {
    throw new Error("Cart is empty");
  }

  const supabase = await createClient();

  const { data: fair } = await supabase
    .from("fairs")
    .select("stripe_terminal_location_id, sales_tax_pct, tax_applies_in_person")
    .eq("id", fairId)
    .single();

  if (!fair?.stripe_terminal_location_id) {
    throw new Error(
      "Set up a Terminal reader for this fair first (fair's Edit page)",
    );
  }

  const catalogItemIds = cart.map((line) => line.catalog_item_id);

  const [
    { data: catalogItems, error: catalogError },
    { data: allocations, error: allocError },
    { data: soldRows, error: soldError },
  ] = await Promise.all([
    supabase
      .from("catalog_items")
      .select("id, title, price, cost")
      .in("id", catalogItemIds),
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
    soldByItem.set(
      row.catalog_item_id,
      (soldByItem.get(row.catalog_item_id) ?? 0) + 1,
    );
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
  const { data: promotionRows } = await supabase
    .from("promotions")
    .select("id, kind, config, starts_at, ends_at")
    .eq("fair_id", fairId)
    .eq("active", true);
  const activePromotions = (promotionRows ?? []).filter((p) =>
    isPromotionInWindow(p),
  ) as ActivePromotion[];

  const pricedLines = applyPromotions(cart, catalogById, activePromotions);
  const lineItems = pricedLines.map((line) => ({
    ...line,
    title: catalogById.get(line.catalog_item_id)?.title ?? "",
  }));

  const subtotalCents = lineItems.reduce(
    (sum, line) => sum + Math.round(line.price_charged * 100) * line.quantity,
    0,
  );
  // Computed once on the whole cart's subtotal, not per line item, to
  // avoid rounding drift — matches record_cash_sale()/
  // spend_from_wallet()'s own once-per-checkout tax computation
  // (migration 0064).
  const taxCents = fair.tax_applies_in_person
    ? Math.round(subtotalCents * (fair.sales_tax_pct ?? 0))
    : 0;
  const totalCents = subtotalCents + taxCents;

  if (totalCents <= 0) {
    throw new Error("Total must be greater than zero");
  }

  // checkout_sessions has no insert/update policy for authenticated users
  // (migration 0010) — writes are service-role only, same trust boundary as
  // the webhook that reads this row back.
  const service = createServiceClient();

  const { data: session, error: sessionError } = await service
    .from("checkout_sessions")
    .insert({
      fair_id: fairId,
      channel: "in_person",
      line_items: lineItems,
      tax_amount: taxCents / 100,
      buyer_email: buyerEmail || null,
    })
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
// Only the checkout session id is known here, not its fair, so the fair id
// is looked up first (service role — purely to identify which fair this
// session belongs to for the requireFairStaff() check, not to bypass it).
export async function getCheckoutSessionStatus(checkoutSessionId: string) {
  const service = createServiceClient();

  const { data: session, error: lookupError } = await service
    .from("checkout_sessions")
    .select("fair_id, status")
    .eq("id", checkoutSessionId)
    .single();
  if (lookupError) throw new Error(lookupError.message);

  await requireFairStaff(session.fair_id);

  return session.status as string;
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
export async function searchWallets(
  fairId: string,
  query: string,
): Promise<WalletMatch[]> {
  await requireFairStaff(fairId);
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

// Lets an in-person volunteer create a wallet on the spot for a student
// who was never funded by a parent online — the clearest case of
// qualifying for wallet assistance pool help (migration 0059): balance
// starts at exactly $0. student_wallets has no authenticated-role insert
// policy (every wallet mutation in this app goes through a security
// definer RPC or the service-role client, never a raw authenticated
// insert), so this calls create_wallet_at_checkout rather than inserting
// directly — that RPC does the same "exact-tuple lookup, else insert"
// logic as createWalletFunding above. No initial-balance field is
// exposed here — a wallet only ever starts at $0 and grows via a real
// parent payment or the pool at checkout, preserving the funding
// model's integrity.
export async function createWalletAtCheckout(
  fairId: string,
  studentName: string,
  grade: string,
  teacher: string,
): Promise<WalletMatch> {
  await requireFairStaff(fairId);

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_wallet_at_checkout", {
      p_fair_id: fairId,
      p_student_name: studentName,
      p_grade: grade,
      p_teacher: teacher,
    })
    .single();
  if (error) throw new Error(error.message);

  return data as WalletMatch;
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
// Best-effort checkout_sessions receipt row for a tender that already
// settled synchronously (cash/wallet) — mirrors createInPersonCheckout's
// own insert, but after the fact, since there's no PaymentIntent to create
// first here. Never throws: a receipt-row failure must never undo an
// already-completed sale. taxCents is recomputed the same way
// record_cash_sale/spend_from_wallet compute it themselves (migration
// 0064: round(subtotal * sales_tax_pct, 2), unconditionally — those RPCs
// don't gate on tax_applies_cash/tax_applies_wallet), so the receipt
// reflects what was actually charged.
async function recordSynchronousReceipt(
  service: ReturnType<typeof createServiceClient>,
  params: {
    fairId: string;
    channel: "cash" | "wallet";
    lineItems: { catalog_item_id: string; title: string; quantity: number; price_charged: number; promotion_id: string | null }[];
    taxCents: number;
    buyerEmail?: string;
  },
): Promise<string | null> {
  try {
    const { data: session, error } = await service
      .from("checkout_sessions")
      .insert({
        fair_id: params.fairId,
        channel: params.channel,
        status: "completed",
        line_items: params.lineItems,
        tax_amount: params.taxCents / 100,
        buyer_email: params.buyerEmail || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return session.id as string;
  } catch (err) {
    console.error("Failed to record checkout session receipt", err);
    return null;
  }
}

// Best-effort — a delivery failure must never fail the sale that already
// completed. Shared by chargeCash/chargeWallet's immediate-send paths
// (synchronous tenders, no webhook involved).
async function sendReceiptEmail(params: {
  to: string;
  fairName: string;
  checkoutSessionId: string;
  fairId: string;
  lineItems: { title: string; quantity: number; price_charged: number }[];
  taxAmount: number;
}) {
  try {
    await sendOrderConfirmationEmail({
      to: params.to,
      buyerName: null,
      fairName: params.fairName,
      orderCode: params.checkoutSessionId.slice(0, 8).toUpperCase(),
      orderUrl: `${siteUrl()}/fairs/${params.fairId}/order/${params.checkoutSessionId}`,
      lineItems: params.lineItems,
      taxAmount: params.taxAmount,
    });
  } catch (err) {
    console.error("Failed to send receipt email", err);
  }
}

export async function chargeWallet(
  fairId: string,
  walletId: string,
  cart: CartLine[],
  buyerEmail?: string,
) {
  await requireFairStaff(fairId);
  if (!cart.length) {
    throw new Error("Cart is empty");
  }

  const supabase = await createClient();

  const catalogItemIds = cart.map((line) => line.catalog_item_id);
  const [
    { data: catalogItems, error: catalogError },
    { data: fair, error: fairError },
  ] = await Promise.all([
    supabase.from("catalog_items").select("id, title, price, cost").in("id", catalogItemIds),
    supabase.from("fairs").select("name, sales_tax_pct").eq("id", fairId).single(),
  ]);
  if (catalogError) throw new Error(catalogError.message);
  if (fairError) throw new Error(fairError.message);

  const catalogById = new Map((catalogItems ?? []).map((c) => [c.id, c]));

  const { data: promotionRows } = await supabase
    .from("promotions")
    .select("id, kind, config, starts_at, ends_at")
    .eq("fair_id", fairId)
    .eq("active", true);
  const activePromotions = (promotionRows ?? []).filter((p) =>
    isPromotionInWindow(p),
  ) as ActivePromotion[];

  const pricedLines = applyPromotions(cart, catalogById, activePromotions);

  const { error } = await supabase.rpc("spend_from_wallet", {
    p_wallet_id: walletId,
    p_fair_id: fairId,
    p_line_items: pricedLines,
  });

  if (error) throw new Error(error.message);

  const lineItems = pricedLines.map((line) => ({
    ...line,
    title: catalogById.get(line.catalog_item_id)?.title ?? "",
  }));
  const subtotalCents = lineItems.reduce(
    (sum, line) => sum + Math.round(line.price_charged * 100) * line.quantity,
    0,
  );
  const taxCents = Math.round(subtotalCents * (fair.sales_tax_pct ?? 0));

  const service = createServiceClient();
  const checkoutSessionId = await recordSynchronousReceipt(service, {
    fairId,
    channel: "wallet",
    lineItems,
    taxCents,
    buyerEmail,
  });

  if (checkoutSessionId) {
    if (buyerEmail) {
      void sendReceiptEmail({
        to: buyerEmail,
        fairName: fair.name,
        checkoutSessionId,
        fairId,
        lineItems,
        taxAmount: taxCents / 100,
      });
    }

    // The direct answer to "what about kids with no device" — auto-email
    // whoever most recently funded this wallet (wallet_fundings.parent_email,
    // migration 0028), independent of whether staff entered buyerEmail
    // above. Only the most recent funder's email is used if the wallet's
    // been topped up by more than one relative.
    try {
      const { data: funding } = await service
        .from("wallet_fundings")
        .select("parent_email")
        .eq("wallet_id", walletId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (funding?.parent_email && funding.parent_email !== buyerEmail) {
        void sendReceiptEmail({
          to: funding.parent_email,
          fairName: fair.name,
          checkoutSessionId,
          fairId,
          lineItems,
          taxAmount: taxCents / 100,
        });
      }
    } catch (err) {
      console.error("Failed to look up wallet funding parent email", err);
    }
  }

  return { checkoutSessionId };
}

// Records a cash sale — the fourth tender, alongside the reader and
// wallet, and the last of the four payment options to actually get a UI
// (migration 0043). Settles synchronously like the wallet path, not
// asynchronously like the reader (no PaymentIntent/webhook involved for
// cash at all).
export async function chargeCash(fairId: string, cart: CartLine[], buyerEmail?: string) {
  await requireFairStaff(fairId);
  if (!cart.length) {
    throw new Error("Cart is empty");
  }

  const supabase = await createClient();

  const catalogItemIds = cart.map((line) => line.catalog_item_id);
  const [
    { data: catalogItems, error: catalogError },
    { data: fair, error: fairError },
  ] = await Promise.all([
    supabase.from("catalog_items").select("id, title, price, cost").in("id", catalogItemIds),
    supabase.from("fairs").select("name, sales_tax_pct").eq("id", fairId).single(),
  ]);
  if (catalogError) throw new Error(catalogError.message);
  if (fairError) throw new Error(fairError.message);

  const catalogById = new Map((catalogItems ?? []).map((c) => [c.id, c]));

  const { data: promotionRows } = await supabase
    .from("promotions")
    .select("id, kind, config, starts_at, ends_at")
    .eq("fair_id", fairId)
    .eq("active", true);
  const activePromotions = (promotionRows ?? []).filter((p) =>
    isPromotionInWindow(p),
  ) as ActivePromotion[];

  const pricedLines = applyPromotions(cart, catalogById, activePromotions);

  const { error } = await supabase.rpc("record_cash_sale", {
    p_fair_id: fairId,
    p_line_items: pricedLines,
  });

  if (error) throw new Error(error.message);

  const lineItems = pricedLines.map((line) => ({
    ...line,
    title: catalogById.get(line.catalog_item_id)?.title ?? "",
  }));
  const subtotalCents = lineItems.reduce(
    (sum, line) => sum + Math.round(line.price_charged * 100) * line.quantity,
    0,
  );
  const taxCents = Math.round(subtotalCents * (fair.sales_tax_pct ?? 0));

  const service = createServiceClient();
  const checkoutSessionId = await recordSynchronousReceipt(service, {
    fairId,
    channel: "cash",
    lineItems,
    taxCents,
    buyerEmail,
  });

  if (checkoutSessionId && buyerEmail) {
    void sendReceiptEmail({
      to: buyerEmail,
      fairName: fair.name,
      checkoutSessionId,
      fairId,
      lineItems,
      taxAmount: taxCents / 100,
    });
  }

  return { checkoutSessionId };
}

// Shared by CheckoutClient.tsx after any of the three tenders completes —
// a "View receipt"/"Print receipt" link + QR for the public order page
// (same unguessable-UUID trust boundary that page already documents for
// itself), useful whenever an adult with a phone is at the table, on top
// of the auto-email paths above.
export async function getReceiptLink(fairId: string, checkoutSessionId: string) {
  await requireFairStaff(fairId);
  const url = `${siteUrl()}/fairs/${fairId}/order/${checkoutSessionId}`;
  const qrDataUrl = await qrCodeDataUrl(url);
  return { url, qrDataUrl };
}
