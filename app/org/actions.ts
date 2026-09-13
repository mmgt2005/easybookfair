"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireOrgStaff } from "@/lib/auth";

// RLS (fair_requests_org_insert) is the real boundary — this org_id check
// is just so a mismatched request gets a clear error instead of a bare
// RLS rejection.
export async function createFairRequest(formData: FormData) {
  const { user, orgIds } = await requireOrgStaff();
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

  const { error } = await supabase.from("fair_requests").insert({
    org_id: orgId,
    requested_by: user.id,
    requested_by_email: user.email,
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
