"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrgStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { inviteOrFindAccount } from "@/lib/accounts";
import { siteUrl } from "@/lib/email";
import { parseShippingAddress } from "@/lib/shippingAddress";

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
    userId = await inviteOrFindAccount(service, email, `${siteUrl()}/auth/callback?next=/org`);
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

// Any org member can update their own org's shipping address (not gated
// to org_admin like invite/role-change above — this is contact info, not
// a money or access-control change). organizations has no org-staff
// UPDATE policy at all (only organizations_admin_write, migration 0005),
// so this goes through update_org_shipping_address() (migration 0066), a
// security definer RPC gated by app.can_operate_org() instead of opening
// a broader write policy — same reasoning as set_fundraiser_goal().
export async function updateOrgShippingAddress(orgId: string, formData: FormData) {
  const { orgIds } = await requireOrgStaff();
  if (!orgIds.includes(orgId)) {
    redirect(`/org/staff?error=${encodeURIComponent("Not authorized for this org")}`);
  }

  const supabase = await createClient();
  const shipping = parseShippingAddress(formData);

  const { error } = await supabase.rpc("update_org_shipping_address", {
    p_org_id: orgId,
    p_shipping_contact_name: shipping.shipping_contact_name,
    p_shipping_contact_phone: shipping.shipping_contact_phone,
    p_shipping_address_line1: shipping.shipping_address_line1,
    p_shipping_address_line2: shipping.shipping_address_line2,
    p_shipping_city: shipping.shipping_city,
    p_shipping_state: shipping.shipping_state,
    p_shipping_postal_code: shipping.shipping_postal_code,
    p_shipping_country: shipping.shipping_country,
  });
  if (error) {
    redirect(`/org/staff?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/org/staff");
  redirect("/org/staff");
}
