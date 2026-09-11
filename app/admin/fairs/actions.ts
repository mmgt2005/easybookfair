"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";

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

  if (!name || !startDate || !endDate || !returnDeadline || !status) {
    throw new Error("All fields are required");
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
    })
    .eq("id", fairId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/fairs");
  revalidatePath(`/admin/fairs/${fairId}/allocations`);
  redirect("/admin/fairs");
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
