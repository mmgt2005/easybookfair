"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkForSpam } from "@/lib/spamGuard";
import { parseShippingAddress } from "@/lib/shippingAddress";

// Public — no login required, same trust model as
// app/author/submit/actions.ts: anyone can submit, an admin reviews every
// row before it becomes a real organization.
export async function submitOrgSignup(formData: FormData) {
  const supabase = await createClient();

  const orgName = String(formData.get("org_name") ?? "").trim();
  const contactName = String(formData.get("contact_name") ?? "").trim();
  const contactEmail = String(formData.get("contact_email") ?? "").trim();
  const isSchool = formData.get("is_school") === "on";
  const message = String(formData.get("message") ?? "").trim() || null;
  const shipping = parseShippingAddress(formData);

  if (!orgName || !contactName || !contactEmail) {
    redirect(
      `/join?error=${encodeURIComponent("Organization name, contact name, and contact email are required")}`,
    );
  }
  if (!shipping.shipping_address_line1 || !shipping.shipping_city || !shipping.shipping_state || !shipping.shipping_postal_code) {
    redirect(
      `/join?error=${encodeURIComponent("A full shipping address is required so we know where to send inventory")}`,
    );
  }

  const spamCheck = await checkForSpam({
    turnstileToken: formData.get("cf-turnstile-response") as string | null,
    email: contactEmail,
    honeypot: formData.get("company") as string | null,
  });
  if (spamCheck.blocked) {
    if (spamCheck.silent) {
      redirect("/join?success=1");
    }
    redirect(`/join?error=${encodeURIComponent(spamCheck.message)}`);
  }

  const { error } = await supabase.from("org_signups").insert({
    org_name: orgName,
    contact_name: contactName,
    contact_email: contactEmail,
    is_school: isSchool,
    message,
    ...shipping,
  });

  if (error) {
    redirect(`/join?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/join?success=1");
}
