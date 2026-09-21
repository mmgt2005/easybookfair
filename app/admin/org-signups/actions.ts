"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { siteUrl } from "@/lib/email";
import { inviteOrFindAccount } from "@/lib/accounts";

// Approving does three things (best-effort, same trade-off as
// approveAuthorSubmission): creates the real organizations row, invites
// the contact by email (a real account, so they can sign in to /org and
// request their first fair), and adds them as org_members so /org
// actually lets them in once they do.
export async function approveOrgSignup(signupId: string) {
  await requireAdmin();
  const service = createServiceClient();

  const { data: signup, error: fetchError } = await service
    .from("org_signups")
    .select("org_name, contact_name, contact_email, is_school, status")
    .eq("id", signupId)
    .single();

  if (fetchError || !signup) {
    redirect(`/admin/org-signups?error=${encodeURIComponent("Signup not found")}`);
  }
  if (signup!.status !== "pending") {
    redirect(`/admin/org-signups?error=${encodeURIComponent("Signup already reviewed")}`);
  }

  const { data: org, error: orgError } = await service
    .from("organizations")
    .insert({
      name: signup!.org_name,
      contact_name: signup!.contact_name,
      contact_email: signup!.contact_email,
      is_school: signup!.is_school,
      status: "approved",
    })
    .select("id")
    .single();
  if (orgError) {
    redirect(`/admin/org-signups?error=${encodeURIComponent(orgError.message)}`);
  }

  // Invite the contact by email (Supabase's own invite flow, same as
  // approveAuthorSubmission).
  let contactUserId: string;
  try {
    contactUserId = await inviteOrFindAccount(service, signup!.contact_email, `${siteUrl()}/org`);
  } catch (err) {
    redirect(
      `/admin/org-signups?error=${encodeURIComponent(
        err instanceof Error ? err.message : "Could not create or find an account",
      )}`,
    );
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
    redirect(`/admin/org-signups?error=${encodeURIComponent(memberError.message)}`);
  }

  const { error: updateError } = await service
    .from("org_signups")
    .update({ status: "approved", org_id: org!.id })
    .eq("id", signupId);

  revalidatePath("/admin/org-signups");
  revalidatePath("/admin/organizations");
  if (updateError) {
    redirect(`/admin/org-signups?error=${encodeURIComponent(updateError.message)}`);
  }

  redirect("/admin/org-signups");
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
