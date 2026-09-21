"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function pagePath(fairId: string) {
  return `/admin/fairs/${fairId}/returns`;
}

function withError(fairId: string, message: string): never {
  redirect(`${pagePath(fairId)}?error=${encodeURIComponent(message)}`);
}

// No explicit requireAdmin() here — matches the sibling allocations
// actions (app/admin/fairs/[fairId]/allocations/actions.ts): the RPC's
// own app.is_platform_admin() check is the real boundary.
export async function receiveReturn(fairId: string, formData: FormData) {
  const allocationId = String(formData.get("allocation_id"));
  const quantity = Number(formData.get("quantity"));
  const supabase = await createClient();

  if (!Number.isFinite(quantity) || quantity <= 0) {
    withError(fairId, "Quantity must be positive");
  }

  const { error } = await supabase.rpc("receive_allocation_return", {
    p_allocation_id: allocationId,
    p_quantity: quantity,
  });

  revalidatePath(pagePath(fairId));
  if (error) withError(fairId, error.message);
  redirect(pagePath(fairId));
}
