"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
