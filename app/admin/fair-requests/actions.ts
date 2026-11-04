"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendFairApprovedEmail } from "@/lib/email";

type CoreResult = { ok: true } | { ok: false; error: string };

// The exact body of approveFairRequest (below), minus the redirects — a
// mechanical, behavior-preserving extraction so the same multi-step
// procedure (create the fairs row, link the request, best-effort email)
// can run once per id in approveManyFairRequests's loop without each
// iteration's redirect() aborting the batch. The single-item action is
// now a thin wrapper around this; it must keep producing the exact same
// redirects it always has.
async function approveFairRequestCore(
  requestId: string,
  equipmentRentalFee: number,
): Promise<CoreResult> {
  const supabase = await createClient();

  const { data: request, error: fetchError } = await supabase
    .from("fair_requests")
    .select(
      "org_id, requested_name, requested_start_date, requested_end_date, requested_return_deadline, allow_online, allow_wallet, allow_in_person, allow_cash, requested_by_email, status",
    )
    .eq("id", requestId)
    .single();

  if (fetchError || !request) {
    return { ok: false, error: "Request not found" };
  }
  if (request.status !== "pending") {
    return { ok: false, error: "Request already reviewed" };
  }

  const { data: fair, error: fairError } = await supabase
    .from("fairs")
    .insert({
      org_id: request.org_id,
      name: request.requested_name,
      start_date: request.requested_start_date,
      end_date: request.requested_end_date,
      return_deadline: request.requested_return_deadline,
      allow_online: request.allow_online,
      allow_wallet: request.allow_wallet,
      allow_in_person: request.allow_in_person,
      allow_cash: request.allow_cash,
      equipment_rental_fee: request.allow_in_person ? equipmentRentalFee : 0,
    })
    .select("id")
    .single();

  if (fairError) {
    return { ok: false, error: fairError.message };
  }

  const { error: updateError } = await supabase
    .from("fair_requests")
    .update({ status: "approved", fair_id: fair!.id })
    .eq("id", requestId);

  revalidatePath("/admin/fair-requests");
  revalidatePath("/admin/fairs");
  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  // Best-effort, same reasoning as every other transactional email in this
  // app (lib/email.ts) — the fair is already created and approved either
  // way; a delivery failure here is only logged.
  if (request.requested_by_email) {
    try {
      await sendFairApprovedEmail({
        to: request.requested_by_email,
        fairName: request.requested_name,
        startDate: request.requested_start_date,
        endDate: request.requested_end_date,
      });
    } catch (emailError) {
      console.error("Failed to send fair-approved email", emailError);
    }
  }

  return { ok: true };
}

// Approving copies the request's dates and payment-option choices into a
// real `fairs` row (fairs_admin_write already permits this for an admin
// session) and links the request back to it — org staff never write
// `fairs` directly, only requests.
export async function approveFairRequest(requestId: string, formData: FormData) {
  const rentalFeeInput = formData.get("equipment_rental_fee");
  const equipmentRentalFee = rentalFeeInput ? Number(rentalFeeInput) : 0;

  const result = await approveFairRequestCore(requestId, equipmentRentalFee);
  if (!result.ok) {
    redirect(`/admin/fair-requests?error=${encodeURIComponent(result.error)}`);
  }
  redirect("/admin/fair-requests");
}

// Bulk approve — same core procedure run once per id, sequentially (not
// Promise.all: each id does a real fairs-row insert plus an email; running
// concurrently makes partial-failure bookkeeping harder to reason about
// for no real benefit at this app's scale). One shared equipment rental
// fee applies to every selected request that allows in-person (defaults
// to 0) — a request needing a different fee still has the single-item
// path for that. Never aborts the batch on one failure; redirects once
// with a summary of how many succeeded.
export async function approveManyFairRequests(formData: FormData) {
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) {
    redirect(`/admin/fair-requests?error=${encodeURIComponent("Select at least one request")}`);
  }
  const rentalFeeInput = formData.get("equipment_rental_fee");
  const equipmentRentalFee = rentalFeeInput ? Number(rentalFeeInput) : 0;

  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of ids) {
    const result = await approveFairRequestCore(id, equipmentRentalFee);
    results.push({ id, ...result });
  }

  const failed = results.filter((r) => !r.ok);
  const message =
    failed.length === 0
      ? null
      : `Approved ${results.length - failed.length} of ${results.length}. Failed: ${failed
          .map((f) => f.error)
          .join("; ")}`;

  redirect(
    message ? `/admin/fair-requests?error=${encodeURIComponent(message)}` : "/admin/fair-requests",
  );
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

// Decline has no side effects (unlike approve) on any queue in this app,
// so the bulk version is just the same update scoped to many ids in one
// query — no core extraction or loop needed.
export async function declineManyFairRequests(formData: FormData) {
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) {
    redirect(`/admin/fair-requests?error=${encodeURIComponent("Select at least one request")}`);
  }
  const supabase = await createClient();
  const adminNote = String(formData.get("admin_note") ?? "").trim() || null;

  const { error } = await supabase
    .from("fair_requests")
    .update({ status: "declined", admin_note: adminNote })
    .in("id", ids)
    .eq("status", "pending");

  revalidatePath("/admin/fair-requests");
  if (error) {
    redirect(`/admin/fair-requests?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/admin/fair-requests");
}
