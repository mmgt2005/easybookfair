"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { siteUrl } from "@/lib/email";
import { inviteOrFindAccount } from "@/lib/accounts";

type CoreResult = { ok: true } | { ok: false; error: string };

// The exact body of approveOrgSignup (below), minus the redirects — a
// mechanical, behavior-preserving extraction so the same multi-step
// procedure (create the org, invite the contact, add them as org_admin,
// link the signup) can run once per id in approveManyOrgSignups's loop
// without each iteration's redirect() aborting the batch. The
// single-item action is now a thin wrapper around this; it must keep
// producing the exact same redirects it always has.
async function approveOrgSignupCore(signupId: string): Promise<CoreResult> {
  const service = createServiceClient();

  const { data: signup, error: fetchError } = await service
    .from("org_signups")
    .select(
      "org_name, contact_name, contact_email, is_school, status, shipping_contact_name, shipping_contact_phone, shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country",
    )
    .eq("id", signupId)
    .single();

  if (fetchError || !signup) {
    return { ok: false, error: "Signup not found" };
  }
  if (signup.status !== "pending") {
    return { ok: false, error: "Signup already reviewed" };
  }

  const { data: org, error: orgError } = await service
    .from("organizations")
    .insert({
      name: signup.org_name,
      contact_name: signup.contact_name,
      contact_email: signup.contact_email,
      is_school: signup.is_school,
      status: "approved",
      shipping_contact_name: signup.shipping_contact_name,
      shipping_contact_phone: signup.shipping_contact_phone,
      shipping_address_line1: signup.shipping_address_line1,
      shipping_address_line2: signup.shipping_address_line2,
      shipping_city: signup.shipping_city,
      shipping_state: signup.shipping_state,
      shipping_postal_code: signup.shipping_postal_code,
      shipping_country: signup.shipping_country,
    })
    .select("id")
    .single();
  if (orgError) {
    return { ok: false, error: orgError.message };
  }

  // Invite the contact by email (Supabase's own invite flow, same as
  // approveAuthorSubmission).
  let contactUserId: string;
  try {
    contactUserId = await inviteOrFindAccount(
      service,
      signup.contact_email,
      `${siteUrl()}/auth/invite?next=/org`,
      { kind: "org_founder", orgName: signup.org_name },
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not create or find an account",
    };
  }

  // org_admin, not the default org_staff — this is the org's founding
  // contact, who should be able to invite their own staff immediately
  // (see /org/staff) rather than needing another admin to promote them.
  const { error: memberError } = await service
    .from("org_members")
    .upsert(
      { org_id: org!.id, user_id: contactUserId, role: "org_admin" },
      { onConflict: "org_id,user_id" },
    );
  if (memberError) {
    return { ok: false, error: memberError.message };
  }

  const { error: updateError } = await service
    .from("org_signups")
    .update({ status: "approved", org_id: org!.id })
    .eq("id", signupId);

  revalidatePath("/admin/org-signups");
  revalidatePath("/admin/organizations");
  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  return { ok: true };
}

// Approving does three things (best-effort, same trade-off as
// approveAuthorSubmission): creates the real organizations row, invites
// the contact by email (a real account, so they can sign in to /org and
// request their first fair), and adds them as org_members so /org
// actually lets them in once they do.
export async function approveOrgSignup(signupId: string) {
  await requireAdmin();
  const result = await approveOrgSignupCore(signupId);
  if (!result.ok) {
    redirect(`/admin/org-signups?error=${encodeURIComponent(result.error)}`);
  }
  redirect("/admin/org-signups");
}

// Bulk approve — same core procedure run once per id, sequentially (not
// Promise.all: each id does a real Supabase Admin API invite call plus
// an organizations-row insert; running concurrently risks rate-limiting
// and makes partial-failure bookkeeping harder to reason about). Never
// aborts the batch on one failure; redirects once with a summary of how
// many succeeded.
export async function approveManyOrgSignups(formData: FormData) {
  await requireAdmin();
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) {
    redirect(`/admin/org-signups?error=${encodeURIComponent("Select at least one signup")}`);
  }

  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of ids) {
    const result = await approveOrgSignupCore(id);
    results.push({ id, ...result });
  }

  const failed = results.filter((r) => !r.ok);
  const message =
    failed.length === 0
      ? null
      : `Approved ${results.length - failed.length} of ${results.length}. Failed: ${failed
          .map((f) => f.error)
          .join("; ")}`;

  redirect(message ? `/admin/org-signups?error=${encodeURIComponent(message)}` : "/admin/org-signups");
}

export async function declineOrgSignup(signupId: string, formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const adminNote = String(formData.get("admin_note") ?? "").trim() || null;

  const { error } = await supabase
    .from("org_signups")
    .update({ status: "declined", admin_note: adminNote })
    .eq("id", signupId)
    .eq("status", "pending");

  revalidatePath("/admin/org-signups");
  if (error) {
    redirect(`/admin/org-signups?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/admin/org-signups");
}

// Decline has no side effects, so the bulk version is just the same
// update scoped to many ids in one query — no core extraction or loop
// needed.
export async function declineManyOrgSignups(formData: FormData) {
  await requireAdmin();
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) {
    redirect(`/admin/org-signups?error=${encodeURIComponent("Select at least one signup")}`);
  }
  const supabase = await createClient();
  const adminNote = String(formData.get("admin_note") ?? "").trim() || null;

  const { error } = await supabase
    .from("org_signups")
    .update({ status: "declined", admin_note: adminNote })
    .in("id", ids)
    .eq("status", "pending");

  revalidatePath("/admin/org-signups");
  if (error) {
    redirect(`/admin/org-signups?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/admin/org-signups");
}
