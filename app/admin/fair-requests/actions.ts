"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Approving copies the request's dates and payment-option choices into a
// real `fairs` row (fairs_admin_write already permits this for an admin
// session) and links the request back to it — org staff never write
// `fairs` directly, only requests.
export async function approveFairRequest(requestId: string) {
  const supabase = await createClient();

  const { data: request, error: fetchError } = await supabase
    .from("fair_requests")
    .select(
      "org_id, requested_name, requested_start_date, requested_end_date, requested_return_deadline, allow_online, allow_wallet, allow_in_person, allow_cash, status",
    )
    .eq("id", requestId)
    .single();

  if (fetchError || !request) {
    redirect(`/admin/fair-requests?error=${encodeURIComponent("Request not found")}`);
  }
  if (request!.status !== "pending") {
    redirect(`/admin/fair-requests?error=${encodeURIComponent("Request already reviewed")}`);
  }

  const { data: fair, error: fairError } = await supabase
    .from("fairs")
    .insert({
      org_id: request!.org_id,
      name: request!.requested_name,
      start_date: request!.requested_start_date,
      end_date: request!.requested_end_date,
      return_deadline: request!.requested_return_deadline,
      allow_online: request!.allow_online,
      allow_wallet: request!.allow_wallet,
      allow_in_person: request!.allow_in_person,
      allow_cash: request!.allow_cash,
    })
    .select("id")
    .single();

  if (fairError) {
    redirect(`/admin/fair-requests?error=${encodeURIComponent(fairError.message)}`);
  }

  const { error: updateError } = await supabase
    .from("fair_requests")
    .update({ status: "approved", fair_id: fair!.id })
    .eq("id", requestId);

  revalidatePath("/admin/fair-requests");
  revalidatePath("/admin/fairs");
  if (updateError) {
    redirect(`/admin/fair-requests?error=${encodeURIComponent(updateError.message)}`);
  }

  redirect("/admin/fair-requests");
}

export async function declineFairRequest(requestId: string, formData: FormData) {
  const supabase = await createClient();
  const adminNote = String(formData.get("admin_note") ?? "").trim() || null;

  const { error } = await supabase
    .from("fair_requests")
    .update({ status: "declined", admin_note: adminNote })
    .eq("id", requestId)
    .eq("status", "pending");

  revalidatePath("/admin/fair-requests");
  if (error) {
    redirect(`/admin/fair-requests?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/admin/fair-requests");
}
