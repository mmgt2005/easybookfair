import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getViewAsOrgId, getViewAsAuthorId } from "@/lib/viewAs";

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
 * Non-redirecting admin check — for pages that are normally public (the
 * storefront/wallet-funding pages) but need to know "is this specific
 * visitor an admin" to decide whether to render at all, rather than
 * gating the whole page behind requireAdmin()'s /login redirect (which
 * would wrongly suggest a buyer needs an account). Returns false for an
 * anonymous visitor, same as everyone else.
 */
export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { data: adminRow } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return adminRow !== null;
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
 *
 * An admin "viewing as" an org (lib/viewAs.ts) skips the org_members
 * lookup entirely and returns just that one org id instead — but only
 * once their admin status is re-checked here, against their own real
 * session; the view-as cookie is never trusted by itself. Callers get
 * `viewingAs`/`adminId` back so pages can show a banner and writes can
 * attribute correctly (see e.g. app/org/actions.ts).
 */
export async function requireOrgStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const viewAsOrgId = await getViewAsOrgId();
  if (viewAsOrgId) {
    const { data: adminRow } = await supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminRow) {
      return { user, orgIds: [viewAsOrgId], viewingAs: true, adminId: user.id };
    }
  }

  const { data: memberships } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) {
    redirect("/unauthorized");
  }

  return {
    user,
    orgIds: memberships.map((m) => m.org_id),
    viewingAs: false,
    adminId: null as string | null,
  };
}

/**
 * Guard for running a specific fair's day-of operations (checkout,
 * pickup, wallets) — used by both /admin/fairs/<id>/{checkout,pickup,
 * wallets} and the /org equivalents, and by the Server Actions those
 * screens call, so a request against those actions is authorized the
 * same way regardless of which route it came from. A platform admin can
 * operate any fair; org staff only the fair(s) belonging to an org they're
 * a member of (migration 0046, app.can_operate_fair() enforces the same
 * rule at the RPC layer for defense in depth — this is the UX/redirect
 * gate, not the security boundary).
 */
export async function requireFairStaff(
  fairId: string,
): Promise<{ user: User; isAdmin: boolean }> {
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

  if (adminRow) {
    return { user, isAdmin: true };
  }

  const { data: memberships } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id);
  const orgIds = (memberships ?? []).map((m) => m.org_id);

  if (orgIds.length > 0) {
    const { data: fair } = await supabase
      .from("fairs")
      .select("id")
      .eq("id", fairId)
      .in("org_id", orgIds)
      .maybeSingle();
    if (fair) {
      return { user, isAdmin: false };
    }
  }

  redirect("/unauthorized");
}

/**
 * Guard for the author portal (/author) — mirrors requireOrgStaff().
 * Redirects to /login if unauthenticated, or /unauthorized if
 * authenticated but not in `authors` (only created by an admin approving
 * a submission, migration 0040 — there's no self-serve signup). RLS
 * (author_submissions_select) is what actually enforces which rows an
 * author sees; this is the UX gate.
 *
 * An admin "viewing as" an author (lib/viewAs.ts) skips the `authors`
 * lookup for the *signed-in* user and instead looks up the impersonated
 * author's own profile — but only once their admin status is re-checked
 * here. The returned `authorUserId` is what callers must filter by
 * explicitly (see app/author/(portal)/page.tsx) — admin's own RLS access
 * already sees every author's rows, so without an explicit filter an
 * impersonating admin would see everyone's submissions mixed together,
 * not just the one they're supposed to be viewing as.
 */
export async function requireAuthor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const viewAsAuthorId = await getViewAsAuthorId();
  if (viewAsAuthorId) {
    const { data: adminRow } = await supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminRow) {
      const { data: authorProfile } = await supabase
        .from("authors")
        .select("name")
        .eq("user_id", viewAsAuthorId)
        .maybeSingle();

      return {
        user,
        authorUserId: viewAsAuthorId,
        name: authorProfile?.name ?? "Unknown author",
        viewingAs: true,
        adminId: user.id,
      };
    }
  }

  const { data: authorRow } = await supabase
    .from("authors")
    .select("user_id, name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!authorRow) {
    redirect("/unauthorized");
  }

  return {
    user,
    authorUserId: authorRow.user_id,
    name: authorRow.name,
    viewingAs: false,
    adminId: null as string | null,
  };
}
