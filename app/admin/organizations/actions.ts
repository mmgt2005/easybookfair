"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

// Minimal scaffolding so a fair has somewhere to belong — the real
// application review workflow (approve/decline, Stripe Connect onboarding
// trigger) is Phase 3. This form creates an already-approved org directly,
// skipping that review, purely so Phase 2's catalog/allocation screens have
// something to test against.
export async function createOrganization(formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const contactName = String(formData.get("contact_name") ?? "").trim() || null;
  const contactEmail = String(formData.get("contact_email") ?? "").trim() || null;

  if (!name) {
    throw new Error("Organization name is required");
  }

  const { error } = await supabase.from("organizations").insert({
    name,
    contact_name: contactName,
    contact_email: contactEmail,
    status: "approved",
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/organizations");
}

export async function updateOrganization(orgId: string, formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const contactName = String(formData.get("contact_name") ?? "").trim() || null;
  const contactEmail = String(formData.get("contact_email") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "");
  const isSchool = formData.get("is_school") === "on";

  if (!name || !status) {
    throw new Error("Name and status are required");
  }

  const { error } = await supabase
    .from("organizations")
    .update({
      name,
      contact_name: contactName,
      contact_email: contactEmail,
      status,
      is_school: isSchool,
    })
    .eq("id", orgId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/organizations");
}

function editUrl(orgId: string, params?: string) {
  return `/admin/organizations/${orgId}/edit${params ? `?${params}` : ""}`;
}

// Creates the org's Connect Express account on first call (idempotent
// after that — reuses the stored id), then sends the admin to Stripe's
// hosted onboarding via an Account Link. charges_enabled/payouts_enabled
// only ever get set by the account.updated webhook once Stripe actually
// confirms them — never here, and never just because the link was
// clicked (docs/spec.md, "Stripe Connect onboarding").
export async function startStripeOnboarding(orgId: string) {
  const supabase = await createClient();

  const { data: org, error: fetchError } = await supabase
    .from("organizations")
    .select("id, contact_email, stripe_connect_account_id")
    .eq("id", orgId)
    .single();

  if (fetchError || !org) {
    redirect(editUrl(orgId, `error=${encodeURIComponent("Organization not found")}`));
  }

  let accountLinkUrl: string;
  try {
    const stripe = getStripe();
    let accountId = org!.stripe_connect_account_id as string | null;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: org!.contact_email ?? undefined,
        business_type: "non_profit",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      accountId = account.id;

      const { error: updateError } = await supabase
        .from("organizations")
        .update({ stripe_connect_account_id: accountId })
        .eq("id", orgId);
      if (updateError) {
        throw new Error(updateError.message);
      }
    }

    const headerList = await headers();
    const host = headerList.get("host");
    const protocol = host?.startsWith("localhost") ? "http" : "https";
    const origin = `${protocol}://${host}`;

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}${editUrl(orgId, "stripe=refresh")}`,
      return_url: `${origin}${editUrl(orgId, "stripe=return")}`,
      type: "account_onboarding",
    });

    accountLinkUrl = accountLink.url;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe onboarding failed";
    redirect(editUrl(orgId, `error=${encodeURIComponent(message)}`));
    return;
  }

  redirect(accountLinkUrl);
}

// Fallback for when the account.updated webhook hasn't reached this app —
// not configured on the Stripe dashboard, still catching up, or being
// tested without the Stripe CLI forwarding events locally (see "Stripe
// setup" in README.md). Fetches the account's live status directly from
// Stripe's API and writes the exact same two fields the webhook itself
// would, so the org edit page reflects reality even if the webhook never
// fires — no amount of re-clicking "Start Stripe onboarding" updates
// these otherwise, since that button never sets them itself either.
export async function refreshStripeAccountStatus(orgId: string) {
  const supabase = await createClient();

  const { data: org, error: fetchError } = await supabase
    .from("organizations")
    .select("stripe_connect_account_id")
    .eq("id", orgId)
    .single();

  if (fetchError || !org?.stripe_connect_account_id) {
    redirect(
      editUrl(orgId, `error=${encodeURIComponent("Start Stripe onboarding first")}`),
    );
    return;
  }

  // redirect() throws internally, and a generic catch below would swallow
  // that just like any other error — same reason startStripeOnboarding()
  // above only computes a target string inside try/catch and calls
  // redirect() once, after it, rather than from within either branch.
  let redirectTarget: string;
  try {
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(org.stripe_connect_account_id);

    const { error: updateError } = await supabase
      .from("organizations")
      .update({
        stripe_charges_enabled: account.charges_enabled ?? false,
        stripe_payouts_enabled: account.payouts_enabled ?? false,
      })
      .eq("id", orgId);
    if (updateError) throw new Error(updateError.message);

    redirectTarget = editUrl(orgId, "stripe=refreshed");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to refresh from Stripe";
    redirectTarget = editUrl(orgId, `error=${encodeURIComponent(message)}`);
  }

  revalidatePath(editUrl(orgId));
  redirect(redirectTarget);
}
