"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFairStaff } from "@/lib/auth";

export async function markPickedUp(fairId: string, formData: FormData) {
  await requireFairStaff(fairId);
  const checkoutSessionId = String(formData.get("checkout_session_id"));
  const supabase = await createClient();

  const { error } = await supabase.rpc("mark_checkout_picked_up", {
    p_checkout_session_id: checkoutSessionId,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/admin/fairs/${fairId}/pickup`);
}
