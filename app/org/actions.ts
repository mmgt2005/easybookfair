"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireOrgStaff } from "@/lib/auth";

// RLS (fair_requests_org_insert, or fair_requests_admin_insert while an
// admin is "viewing as" this org — migration 0041) is the real boundary;
// this org_id check is just so a mismatched request gets a clear error
// instead of a bare RLS rejection.
export async function createFairRequest(formData: FormData) {
  const { user, orgIds, viewingAs, adminId } = await requireOrgStaff();
  const supabase = await createClient();

  const orgId = String(formData.get("org_id") ?? "");
  const requestedName = String(formData.get("requested_name") ?? "").trim();
  const startDate = String(formData.get("requested_start_date") ?? "");
  const endDate = String(formData.get("requested_end_date") ?? "");
  const returnDeadline = String(formData.get("requested_return_deadline") ?? "");
  const allowInPerson = formData.get("allow_in_person") === "on";
  const allowOnline = formData.get("allow_online") === "on";
  const allowWallet = formData.get("allow_wallet") === "on";
  const allowCash = formData.get("allow_cash") === "on";

  if (!orgIds.includes(orgId)) {
    throw new Error("You don't have access to that organization");
  }
  if (!requestedName || !startDate || !endDate || !returnDeadline) {
    throw new Error("All fields are required");
  }

  // requested_by stays truthful (the real person who clicked submit,
  // admin included when viewingAs) — requested_by_email is what the
  // approval notification actually goes to, so when an admin submits on
  // an org's behalf it should reach the org's own contact, not the
  // admin's inbox.
  let requestedByEmail = user.email ?? null;
  if (viewingAs) {
    const { data: org } = await supabase
      .from("organizations")
      .select("contact_email")
      .eq("id", orgId)
      .single();
    requestedByEmail = org?.contact_email ?? requestedByEmail;
  }

  const { error } = await supabase.from("fair_requests").insert({
    org_id: orgId,
    requested_by: user.id,
    requested_by_email: requestedByEmail,
    submitted_by_admin_id: viewingAs ? adminId : null,
    requested_name: requestedName,
    requested_start_date: startDate,
    requested_end_date: endDate,
    requested_return_deadline: returnDeadline,
    allow_in_person: allowInPerson,
    allow_online: allowOnline,
    allow_wallet: allowWallet,
    allow_cash: allowCash,
  });

  if (error) {
    redirect(`/org/fairs/request?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/org");
}

// Mirrors createFairRequest above — same org_id/viewingAs/requested_by_email
// resolution, same "RLS is the real boundary, this is just a clearer error"
// reasoning (event_requests_org_insert, or event_requests_admin_insert
// while an admin is "viewing as" this org).
export async function createEventRequest(formData: FormData) {
  const { user, orgIds, viewingAs, adminId } = await requireOrgStaff();
  const supabase = await createClient();

  const fairId = String(formData.get("fair_id") ?? "");
  const catalogItemId = String(formData.get("catalog_item_id") ?? "");
  const eventType = String(formData.get("event_type") ?? "");
  const requestedDate = String(formData.get("requested_date") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!fairId || !catalogItemId) {
    throw new Error("Pick a fair and a book");
  }
  if (eventType !== "author_reading" && eventType !== "book_signing") {
    throw new Error("Pick an event type");
  }

  const { data: fair } = await supabase
    .from("fairs")
    .select("org_id")
    .eq("id", fairId)
    .single();
  if (!fair || !orgIds.includes(fair.org_id)) {
    throw new Error("You don't have access to that fair");
  }
  const orgId = fair.org_id;

  let requestedByEmail = user.email ?? null;
  if (viewingAs) {
    const { data: org } = await supabase
      .from("organizations")
      .select("contact_email")
      .eq("id", orgId)
      .single();
    requestedByEmail = org?.contact_email ?? requestedByEmail;
  }

  const { error } = await supabase.from("event_requests").insert({
    org_id: orgId,
    fair_id: fairId,
    catalog_item_id: catalogItemId,
    event_type: eventType,
    requested_date: requestedDate,
    notes,
    requested_by: user.id,
    requested_by_email: requestedByEmail,
    submitted_by_admin_id: viewingAs ? adminId : null,
  });

  if (error) {
    redirect(
      `/org/events/request?fair_id=${fairId}&error=${encodeURIComponent(error.message)}`,
    );
  }

  redirect("/org");
}
