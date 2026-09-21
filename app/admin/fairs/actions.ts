"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { sendSettlementPayoutEmail, sendSettlementPaymentLinkEmail } from "@/lib/email";

export async function createFair(formData: FormData) {
  const supabase = await createClient();

  const orgId = String(formData.get("org_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  const returnDeadline = String(formData.get("return_deadline") ?? "");

  if (!orgId || !name || !startDate || !endDate || !returnDeadline) {
    throw new Error("All fields are required");
  }

  const { data, error } = await supabase
    .from("fairs")
    .insert({
      org_id: orgId,
      name,
      start_date: startDate,
      end_date: endDate,
      return_deadline: returnDeadline,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/fairs");
  redirect(`/admin/fairs/${data.id}/allocations`);
}

export async function updateFair(fairId: string, formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  const returnDeadline = String(formData.get("return_deadline") ?? "");
  const status = String(formData.get("status") ?? "");
  const cashPct = formData.get("cash_sales_assumption_pct");
  const allowInPerson = formData.get("allow_in_person") === "on";
  const allowOnline = formData.get("allow_online") === "on";
  const allowWallet = formData.get("allow_wallet") === "on";
  const allowCash = formData.get("allow_cash") === "on";
  const rentalFeeInput = formData.get("equipment_rental_fee");
  const equipmentRentalFee = rentalFeeInput ? Number(rentalFeeInput) : 0;

  if (!name || !startDate || !endDate || !returnDeadline || !status) {
    throw new Error("All fields are required");
  }

  // "Closed" is deliberately not a choice here — it must only ever happen
  // through close_fair() (the "Close this fair" button below), which
  // computes and locks the actual settlement. Setting status='closed'
  // through this plain update would silently skip that entirely: no
  // settlement row, no journal entries, no missing-inventory billing —
  // and everything elsewhere that gates on fair.status (the returns
  // screen, receive_allocation_return() itself, the admin dashboard's
  // active-fairs list) would immediately start treating the fair as
  // closed anyway, with no way to undo it short of a manual DB fix.
  // Only rejects an actual transition into 'closed' — a closed fair's own
  // page resubmits its already-closed status unchanged via a hidden
  // field so its other read-only-adjacent fields stay editable.
  const { data: currentFair } = await supabase
    .from("fairs")
    .select("status")
    .eq("id", fairId)
    .single();
  if (status === "closed" && currentFair?.status !== "closed") {
    throw new Error(
      'Use the "Close this fair" button in the Settlement section to close a fair, not this form',
    );
  }

  const { error } = await supabase
    .from("fairs")
    .update({
      name,
      start_date: startDate,
      end_date: endDate,
      return_deadline: returnDeadline,
      status,
      cash_sales_assumption_pct: cashPct ? Number(cashPct) : null,
      allow_in_person: allowInPerson,
      allow_online: allowOnline,
      allow_wallet: allowWallet,
      allow_cash: allowCash,
      equipment_rental_fee: allowInPerson ? equipmentRentalFee : 0,
    })
    .eq("id", fairId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/fairs");
  revalidatePath(`/admin/fairs/${fairId}/allocations`);
  redirect("/admin/fairs");
}

// One-click transition into the return window, separate from the big
// save-everything form above — the fair lifecycle's one truly safe,
// reversible-in-spirit status change (unlike closing), so it gets its
// own obvious, hard-to-miss-for-the-wrong-reason button instead of
// living as one option in a dropdown next to unrelated fields.
export async function moveFairToReturnWindow(fairId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("fairs")
    .update({ status: "return_window" })
    .eq("id", fairId)
    .neq("status", "closed");

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/admin/fairs/${fairId}/edit`);
  revalidatePath("/admin/fairs");
  revalidatePath("/admin");
}

// Computes and locks the fair's settlement (migration 0036) — irreversible
// (close_fair() itself rejects a second call for the same fair via
// settlements' unique fair_id). requireAdmin() here is just the UX gate;
// close_fair() re-checks app.is_platform_admin() itself since it's
// SECURITY DEFINER and bypasses RLS.
export async function closeFair(fairId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.rpc("close_fair", { p_fair_id: fairId });
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/admin/fairs/${fairId}/edit`);
  revalidatePath(`/admin/fairs/${fairId}/returns`);
  revalidatePath("/admin/fairs");
}

// Sends the org their net settlement payout via a Stripe Transfer to
// their connected Express account — the "moving real money" step
// close_fair() (migration 0036) deliberately stops short of automating.
// No idempotency key: acceptable at this app's one-admin-clicking-once
// scale, but a double-click before the first response lands could in
// principle send twice — the disabled-once-sent button is the real guard
// here, not a network-level safeguard.
export async function sendSettlementPayout(fairId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { data: settlement, error: settlementError } = await supabase
    .from("settlements")
    .select("id, org_id, net_payout, stripe_transfer_id")
    .eq("fair_id", fairId)
    .single();

  if (settlementError || !settlement) {
    throw new Error("Settlement not found — close the fair first");
  }
  if (settlement.stripe_transfer_id) {
    throw new Error("A payout has already been sent for this settlement");
  }
  if (settlement.net_payout <= 0) {
    throw new Error("Nothing to pay out — this org isn't owed money on this settlement");
  }

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("name, contact_email, stripe_connect_account_id, stripe_payouts_enabled")
    .eq("id", settlement.org_id)
    .single();

  if (orgError || !org) {
    throw new Error("Organization not found");
  }
  if (!org.stripe_connect_account_id) {
    throw new Error("This org hasn't started Stripe Connect onboarding yet");
  }
  if (!org.stripe_payouts_enabled) {
    throw new Error("This org's Stripe payouts aren't enabled yet — finish their Connect onboarding first");
  }

  const transfer = await getStripe().transfers.create({
    amount: Math.round(settlement.net_payout * 100),
    currency: "usd",
    destination: org.stripe_connect_account_id,
    description: `EasyBookFair settlement payout (fair ${fairId})`,
    metadata: { settlement_id: settlement.id, fair_id: fairId },
  });

  // transfer_confirmed_at is set here, not by a webhook — a Stripe
  // Transfer moves funds between the platform's and the connected
  // account's own Stripe balance, which is synchronous with this call
  // succeeding (unlike a bank Payout, transfers have no separate pending
  // state). transfer.reversed is the one way this can still un-happen
  // later — see the webhook handler.
  const { error: updateError } = await supabase
    .from("settlements")
    .update({ stripe_transfer_id: transfer.id, transfer_confirmed_at: new Date().toISOString() })
    .eq("id", settlement.id);
  if (updateError) {
    throw new Error(updateError.message);
  }

  if (org.contact_email) {
    const { data: fair } = await supabase.from("fairs").select("name").eq("id", fairId).single();
    try {
      await sendSettlementPayoutEmail({
        to: org.contact_email,
        fairName: fair?.name ?? "your fair",
        amount: settlement.net_payout,
      });
    } catch (emailError) {
      console.error("Failed to send settlement payout email", emailError);
    }
  }

  revalidatePath(`/admin/fairs/${fairId}/edit`);
}

// Creates a one-time Stripe Payment Link for the amount the org owes the
// platform (a negative net_payout — cash sales + equipment rental fee
// outweighing their card/online margin) and emails it to the org. Runs on
// the platform's own Stripe account (getStripe()), same merchant-of-
// record model as every other charge in this app — the org pays the
// platform directly, not through their own Connect account. The Payment
// Links API needs an actual Price object, not an inline amount (unlike
// Checkout Sessions) — prices.create() with product_data makes one on
// the fly since the amount is different for every settlement.
export async function createSettlementPaymentLink(fairId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { data: settlement, error: settlementError } = await supabase
    .from("settlements")
    .select("id, org_id, net_payout, stripe_payment_link_id")
    .eq("fair_id", fairId)
    .single();

  if (settlementError || !settlement) {
    throw new Error("Settlement not found — close the fair first");
  }
  if (settlement.stripe_payment_link_id) {
    throw new Error("A payment link already exists for this settlement");
  }
  if (settlement.net_payout >= 0) {
    throw new Error("This org doesn't owe anything on this settlement");
  }

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("contact_email")
    .eq("id", settlement.org_id)
    .single();
  if (orgError || !org) {
    throw new Error("Organization not found");
  }

  const { data: fair } = await supabase.from("fairs").select("name").eq("id", fairId).single();
  const amountOwed = -settlement.net_payout;

  const stripe = getStripe();
  const price = await stripe.prices.create({
    currency: "usd",
    unit_amount: Math.round(amountOwed * 100),
    product_data: { name: `${fair?.name ?? "Book fair"} settlement` },
  });

  const paymentLink = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: { settlement_id: settlement.id, fair_id: fairId },
  });

  const { error: updateError } = await supabase
    .from("settlements")
    .update({ stripe_payment_link_id: paymentLink.id })
    .eq("id", settlement.id);
  if (updateError) {
    throw new Error(updateError.message);
  }

  if (org.contact_email) {
    try {
      await sendSettlementPaymentLinkEmail({
        to: org.contact_email,
        fairName: fair?.name ?? "your fair",
        amount: amountOwed,
        paymentLinkUrl: paymentLink.url,
      });
    } catch (emailError) {
      console.error("Failed to send settlement payment-link email", emailError);
    }
  }

  revalidatePath(`/admin/fairs/${fairId}/edit`);
}

// Creates a Stripe Terminal Location for this fair's venue — required
// before any physical reader can be discovered/connected for in-person
// checkout. Stripe API calls have no RLS boundary of their own (unlike the
// `fairs` update below), so requireAdmin() here is the real gate, not just
// UX convenience.
export async function createTerminalLocation(fairId: string, formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();

  const displayName = String(formData.get("display_name") ?? "").trim();
  const line1 = String(formData.get("line1") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  const postalCode = String(formData.get("postal_code") ?? "").trim();
  const country = String(formData.get("country") ?? "US").trim();

  if (!displayName || !line1 || !city || !state || !postalCode) {
    throw new Error("All address fields are required");
  }

  const location = await getStripe().terminal.locations.create({
    display_name: displayName,
    address: { line1, city, state, postal_code: postalCode, country },
  });

  const { error } = await supabase
    .from("fairs")
    .update({ stripe_terminal_location_id: location.id })
    .eq("id", fairId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/admin/fairs/${fairId}/edit`);
}

// Registers a physical reader (its one-time registration code, shown on the
// device's own screen) to this fair's Terminal Location. Internet-connected
// readers only (BBPOS WisePOS E, Stripe Reader S700) — Bluetooth readers
// need the native iOS/Android Terminal SDKs, which this web app doesn't use.
export async function registerTerminalReader(fairId: string, formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();

  const { data: fair } = await supabase
    .from("fairs")
    .select("stripe_terminal_location_id")
    .eq("id", fairId)
    .single();

  if (!fair?.stripe_terminal_location_id) {
    throw new Error("Set up a Terminal location first");
  }

  const registrationCode = String(formData.get("registration_code") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();

  if (!registrationCode) {
    throw new Error("Registration code is required");
  }

  await getStripe().terminal.readers.create({
    registration_code: registrationCode,
    location: fair.stripe_terminal_location_id,
    label: label || undefined,
  });

  revalidatePath(`/admin/fairs/${fairId}/edit`);
}
