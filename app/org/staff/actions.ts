"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrgStaff } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { inviteOrFindAccount } from "@/lib/accounts";
import { siteUrl } from "@/lib/email";

type OrgRole = "org_admin" | "org_staff";

function parseRole(formData: FormData): OrgRole {
  const role = String(formData.get("role") ?? "");
  return role === "org_admin" ? "org_admin" : "org_staff";
}

async function assertCanManage(orgId: string) {
  const { orgIds, orgAdminOrgIds, viewingAs } = await requireOrgStaff();
  if (!orgIds.includes(orgId) || !(orgAdminOrgIds.includes(orgId) || viewingAs)) {
    redirect(`/org/staff?error=${encodeURIComponent("Not authorized to manage this org's staff")}`);
  }
}

// Invites a real account (same helper as author submissions/org signups/
// admin invites), then upserts org_members — re-inviting an email that's
// already a member doubles as "change their role" since this is an
// upsert, not a plain insert.
export async function inviteOrgStaff(orgId: string, formData: FormData) {
  await assertCanManage(orgId);

  const email = String(formData.get("email") ?? "").trim();
  const role = parseRole(formData);
  if (!email) {
    redirect(`/org/staff?error=${encodeURIComponent("Email is required")}`);
  }

  const service = createServiceClient();
  let userId: string;
  try {
    userId = await inviteOrFindAccount(service, email, `${siteUrl()}/org`);
  } catch (err) {
    redirect(
      `/org/staff?error=${encodeURIComponent(
        err instanceof Error ? err.message : "Could not create or find an account",
      )}`,
    );
  }

  const { error } = await service
    .from("org_members")
    .upsert({ org_id: orgId, user_id: userId, role }, { onConflict: "org_id,user_id" });
  if (error) {
    redirect(`/org/staff?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/org/staff");
  redirect("/org/staff");
}

// Faster path than re-typing an email to flip an existing member's role.
// No self-demotion guard, same reasoning as setAdminRole.
export async function updateOrgMemberRole(orgId: string, userId: string, formData: FormData) {
  await assertCanManage(orgId);
  const role = parseRole(formData);

  const service = createServiceClient();
  const { error } = await service
    .from("org_members")
    .update({ role })
    .eq("org_id", orgId)
    .eq("user_id", userId);
  if (error) {
    redirect(`/org/staff?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/org/staff");
}
