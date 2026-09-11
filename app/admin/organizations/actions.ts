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
