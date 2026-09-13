import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Guard for admin Server Components/Actions. Redirects to /login if
 * unauthenticated, or /unauthorized if authenticated but not a platform
 * admin. This is a UX convenience, not the security boundary —
 * RLS (app.is_platform_admin() in each admin_write policy) is what
 * actually enforces this; a bug here fails closed because the underlying
 * queries would still be rejected by RLS.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: adminRow } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRow) {
    redirect("/unauthorized");
  }

  return user;
}

/**
 * Guard for org-staff Server Components/Actions — mirrors requireAdmin().
 * Redirects to /login if unauthenticated, or /unauthorized if
 * authenticated but not a member of any organization. RLS
 * (app.current_org_ids() in each org-scoped select policy) is what
 * actually enforces which rows a member sees; this is the UX gate.
 *
 * A person can belong to more than one org (org_members has no
 * uniqueness constraint on user_id alone) — this returns all of them,
 * since nothing in the schema assumes a single-org membership.
 */
export async function requireOrgStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: memberships } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) {
    redirect("/unauthorized");
  }

  return { user, orgIds: memberships.map((m) => m.org_id) };
}
