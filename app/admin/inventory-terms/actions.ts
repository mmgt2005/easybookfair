"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Append-only: never edits the current row, always inserts the next
// version number — a past request's frozen terms_text/terms_version
// snapshot (migration 0075) is never retroactively changed by this.
export async function createInventoryTermsVersion(formData: FormData) {
  const { user } = await requireAdmin();
  const supabase = await createClient();

  const termsText = String(formData.get("terms_text") ?? "").trim();
  if (!termsText) {
    redirect(`/admin/inventory-terms?error=${encodeURIComponent("Terms text is required")}`);
  }

  const { data: latest } = await supabase
    .from("inventory_terms_versions")
    .select("version")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latest?.version ?? 0) + 1;

  const { error } = await supabase
    .from("inventory_terms_versions")
    .insert({ version: nextVersion, terms_text: termsText, created_by: user.id });

  revalidatePath("/admin/inventory-terms");
  if (error) {
    redirect(`/admin/inventory-terms?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/admin/inventory-terms");
}
