"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendEventRequestApprovedEmail } from "@/lib/email";

// Unlike approveFairRequest, there's no second "real" row to create —
// approving just flips status; the admin coordinates the actual reading/
// signing manually using the author info shown on this page.
export async function approveEventRequest(requestId: string) {
  const supabase = await createClient();

  const { data: request, error: fetchError } = await supabase
    .from("event_requests")
    .select("event_type, requested_date, requested_by_email, status, fairs(name), catalog_items(title)")
    .eq("id", requestId)
    .single();

  if (fetchError || !request) {
    redirect(`/admin/event-requests?error=${encodeURIComponent("Request not found")}`);
  }
  if (request!.status !== "pending") {
    redirect(`/admin/event-requests?error=${encodeURIComponent("Request already reviewed")}`);
  }

  const { error: updateError } = await supabase
    .from("event_requests")
    .update({ status: "approved" })
    .eq("id", requestId);

  revalidatePath("/admin/event-requests");
  if (updateError) {
    redirect(`/admin/event-requests?error=${encodeURIComponent(updateError.message)}`);
  }

  const fair = request!.fairs as unknown as { name: string } | null;
  const book = request!.catalog_items as unknown as { title: string } | null;

  // Best-effort, same reasoning as every other transactional email in this
  // app (lib/email.ts) — the request is already approved either way; a
  // delivery failure here is only logged. Goes to the org, not the author
  // — the admin coordinates with the author directly using the info shown
  // on this page.
  if (request!.requested_by_email && fair && book) {
    try {
      await sendEventRequestApprovedEmail({
        to: request!.requested_by_email,
        fairName: fair.name,
        bookTitle: book.title,
        eventType: request!.event_type,
        requestedDate: request!.requested_date,
      });
    } catch (emailError) {
      console.error("Failed to send event-request-approved email", emailError);
    }
  }

  redirect("/admin/event-requests");
}

export async function declineEventRequest(requestId: string, formData: FormData) {
  const supabase = await createClient();
  const adminNote = String(formData.get("admin_note") ?? "").trim() || null;

  const { error } = await supabase
    .from("event_requests")
    .update({ status: "declined", admin_note: adminNote })
    .eq("id", requestId)
    .eq("status", "pending");

  revalidatePath("/admin/event-requests");
  if (error) {
    redirect(`/admin/event-requests?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/admin/event-requests");
}

// One batched status update (same as approveEventRequest, just scoped to
// many ids via .in() instead of .eq()), then a best-effort email per row
// approved — reusing the update's own .select() return instead of a
// second fetch query. A failed email never blocks another row's email
// or the redirect, same posture as every other best-effort email loop in
// this app (e.g. sendPoolCloseoutSummaryEmail's per-donor try/catch).
export async function approveManyEventRequests(formData: FormData) {
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) {
    redirect(`/admin/event-requests?error=${encodeURIComponent("Select at least one request")}`);
  }
  const supabase = await createClient();

  const { data: approved, error: updateError } = await supabase
    .from("event_requests")
    .update({ status: "approved" })
    .in("id", ids)
    .eq("status", "pending")
    .select("requested_by_email, event_type, requested_date, fairs(name), catalog_items(title)");

  revalidatePath("/admin/event-requests");
  if (updateError) {
    redirect(`/admin/event-requests?error=${encodeURIComponent(updateError.message)}`);
  }

  for (const r of approved ?? []) {
    const fair = r.fairs as unknown as { name: string } | null;
    const book = r.catalog_items as unknown as { title: string } | null;
    if (!r.requested_by_email || !fair || !book) continue;
    try {
      await sendEventRequestApprovedEmail({
        to: r.requested_by_email,
        fairName: fair.name,
        bookTitle: book.title,
        eventType: r.event_type,
        requestedDate: r.requested_date,
      });
    } catch (emailError) {
      console.error("Failed to send event-request-approved email", emailError);
    }
  }

  redirect("/admin/event-requests");
}

export async function declineManyEventRequests(formData: FormData) {
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) {
    redirect(`/admin/event-requests?error=${encodeURIComponent("Select at least one request")}`);
  }
  const supabase = await createClient();
  const adminNote = String(formData.get("admin_note") ?? "").trim() || null;

  const { error } = await supabase
    .from("event_requests")
    .update({ status: "declined", admin_note: adminNote })
    .in("id", ids)
    .eq("status", "pending");

  revalidatePath("/admin/event-requests");
  if (error) {
    redirect(`/admin/event-requests?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/admin/event-requests");
}
