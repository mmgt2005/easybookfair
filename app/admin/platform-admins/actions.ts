"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { inviteOrFindAccount } from "@/lib/accounts";
import { siteUrl } from "@/lib/email";

type AdminRole = "super_admin" | "admin";

function parseRole(formData: FormData): AdminRole {
  const role = String(formData.get("role") ?? "");
  return role === "super_admin" ? "super_admin" : "admin";
}

// Invites a real account the same way approveAuthorSubmission/
// approveOrgSignup already do, then upserts platform_admins — re-inviting
// an email that's already an admin doubles as "change their role" since
// this is an upsert, not a plain insert.
export async function inviteAdmin(formData: FormData) {
  await requireSuperAdmin();

  const email = String(formData.get("email") ?? "").trim();
  const role = parseRole(formData);
  if (!email) {
    redirect(`/admin/platform-admins?error=${encodeURIComponent("Email is required")}`);
  }

  const service = createServiceClient();
  let userId: string;
  try {
    userId = await inviteOrFindAccount(service, email, `${siteUrl()}/admin`);
  } catch (err) {
    redirect(
      `/admin/platform-admins?error=${encodeURIComponent(
        err instanceof Error ? err.message : "Could not create or find an account",
      )}`,
    );
  }

  const { error } = await service.from("platform_admins").upsert({ user_id: userId, role });
  if (error) {
    redirect(`/admin/platform-admins?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/platform-admins");
  redirect("/admin/platform-admins");
}

// Faster path than re-typing an email to flip an existing admin's role.
// No self-demotion guard — nothing else in this app protects someone
// from editing themselves into a worse state either.
export async function setAdminRole(userId: string, formData: FormData) {
  await requireSuperAdmin();
  const role = parseRole(formData);

  const service = createServiceClient();
  const { error } = await service.from("platform_admins").update({ role }).eq("user_id", userId);
  if (error) {
    redirect(`/admin/platform-admins?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/platform-admins");
}
