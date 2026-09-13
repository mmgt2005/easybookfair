"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";

export async function resetDemoFair() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reset_demo_fair");

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/demo");
  revalidatePath("/admin/fairs");
}

// The demo fair's kill switch (migration 0044) — when disabled, its
// public storefront/wallet pages refuse everyone, admin included. RLS
// (organizations_admin_write) is the real boundary for this update;
// requireAdmin() here is just the UX gate, same as everywhere else.
export async function setDemoEnabled(enabled: boolean) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("organizations")
    .update({ is_demo_enabled: enabled })
    .eq("is_demo", true);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/demo");
  revalidatePath(`/fairs`);
}
