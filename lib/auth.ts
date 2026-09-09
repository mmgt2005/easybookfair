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
