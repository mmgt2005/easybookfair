import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { sendOrderConfirmationEmail, sendWalletFundingEmail } from "@/lib/email";

// Needs Node's crypto for Stripe's signature verification, not the Edge
// runtime.
export const runtime = "nodejs";

// One handler for both onboarding confirmation (account.updated) and sale
// writing (payment_intent.succeeded) — docs/spec.md, "Payment webhook":
// must be idempotent, checking the Stripe event ID before writing anything.
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fast-path dedup: a duplicate delivery of an event we've already logged
  // is treated as success so Stripe stops retrying it. The real
  // correctness guard for payment_intent.succeeded is the row lock +
  // status check inside record_checkout_sale() (migration 0010) — this
  // table is an optimization on top of that, not the sole safety net (see
  // the comment on record_checkout_sale for the tradeoff that implies).
  const { error: insertError } = await supabase.from("webhook_events").insert({
    stripe_event_id: event.id,
    type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  try {
    switch (event.type) {
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const { error } = await supabase
          .from("organizations")
          .update({
            stripe_charges_enabled: account.charges_enabled ?? false,
            stripe_payouts_enabled: account.payouts_enabled ?? false,
          })
          .eq("stripe_connect_account_id", account.id);
        if (error) throw new Error(error.message);
        break;
      }
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        // Two kinds of PaymentIntent now land here: a cart checkout
        // (in-person reader or guest online) and a student-wallet funding.
        // metadata.kind tags which RPC actually owns finishing it up —
        // set when each PaymentIntent is created (checkout/actions.ts,
        // fairs/[fairId]/actions.ts, fairs/[fairId]/wallet/actions.ts).
        const kind = paymentIntent.metadata?.kind;
        const host = request.headers.get("host");
        const origin = `${host?.startsWith("localhost") ? "http" : "https"}://${host}`;

        if (kind === "wallet_funding") {
          const { error } = await supabase.rpc("record_wallet_funding", {
            p_payment_intent_id: paymentIntent.id,
          });
          if (error) throw new Error(error.message);

          // Best-effort: a failed send here must never fail the webhook —
          // the RPC has already committed, so Stripe retrying this event
          // would just re-attempt an already-completed funding.
          try {
            const { data: funding } = await supabase
              .from("wallet_fundings")
              .select("amount, parent_email, student_wallets(student_name, fairs(name))")
              .eq("payment_intent_id", paymentIntent.id)
              .single();
            const wallet = funding?.student_wallets as unknown as {
              student_name: string;
              fairs: { name: string } | null;
            } | null;
            if (funding?.parent_email && wallet?.fairs) {
              await sendWalletFundingEmail({
                to: funding.parent_email,
                studentName: wallet.student_name,
                fairName: wallet.fairs.name,
                amount: Number(funding.amount),
              });
            }
          } catch (emailErr) {
            console.error("Failed to send wallet funding email", emailErr);
          }
        } else {
          const { error } = await supabase.rpc("record_checkout_sale", {
            p_payment_intent_id: paymentIntent.id,
          });
          if (error) throw new Error(error.message);

          try {
            const { data: session } = await supabase
              .from("checkout_sessions")
              .select("id, fair_id, buyer_name, buyer_email, channel, line_items, fairs(name)")
              .eq("payment_intent_id", paymentIntent.id)
              .single();
            const fair = session?.fairs as unknown as { name: string } | null;
            if (session?.channel === "online" && session.buyer_email && fair) {
              await sendOrderConfirmationEmail({
                to: session.buyer_email,
                buyerName: session.buyer_name,
                fairName: fair.name,
                orderCode: session.id.slice(0, 8).toUpperCase(),
                orderUrl: `${origin}/fairs/${session.fair_id}/order/${session.id}`,
                lineItems: session.line_items,
              });
            }
          } catch (emailErr) {
            console.error("Failed to send order confirmation email", emailErr);
          }
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook handler failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
