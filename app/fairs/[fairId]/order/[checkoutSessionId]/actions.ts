"use server";

import { createClient } from "@/lib/supabase/server";
import { sendOrderConfirmationEmail, siteUrl } from "@/lib/email";

type OrderPublic = {
  id: string;
  status: string;
  buyer_name: string | null;
  line_items: { title: string; quantity: number; price_charged: number }[];
  fair_name: string;
  tax_amount: number;
};

// Self-serve resend for a buyer who didn't get (or lost) their receipt
// email — same unguessable-UUID trust boundary this page already relies
// on for itself (see page.tsx's own comment); no auth needed, since
// anyone who already has the order link has full read access to this
// order via get_checkout_session_public.
export async function requestReceiptEmail(
  fairId: string,
  checkoutSessionId: string,
  email: string,
) {
  if (!email.trim()) {
    throw new Error("Email is required");
  }

  const supabase = await createClient();
  const { data: order } = await supabase
    .rpc("get_checkout_session_public", { p_checkout_session_id: checkoutSessionId })
    .maybeSingle<OrderPublic>();

  if (!order || order.status !== "completed") {
    throw new Error("Order not found");
  }

  await sendOrderConfirmationEmail({
    to: email.trim(),
    buyerName: order.buyer_name,
    fairName: order.fair_name,
    orderCode: order.id.slice(0, 8).toUpperCase(),
    orderUrl: `${siteUrl()}/fairs/${fairId}/order/${order.id}`,
    lineItems: order.line_items,
    taxAmount: order.tax_amount,
  });
}
