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

// Receives every line item at its current full returnable quantity in
// one click, instead of typing a quantity into each row — recomputes
// "returnable" fresh server-side (never trusts a stale client value,
// since time may have passed since the page was rendered) using the
// exact same allocated-returned-sold formula the page itself computes.
// Loops the same already-tested receive_allocation_return RPC the
// per-row form already calls, one call per line item, and never aborts
// the loop on one failure — the existing per-row manual inputs stay
// available for partial/corrected receives afterward.
export async function receiveAllReturns(fairId: string) {
  const supabase = await createClient();

  const [{ data: allocations }, { data: sales }] = await Promise.all([
    supabase
      .from("allocations")
      .select("id, catalog_item_id, quantity_allocated, quantity_returned")
      .eq("fair_id", fairId),
    supabase.from("sales").select("catalog_item_id").eq("fair_id", fairId).eq("status", "completed"),
  ]);

  const soldByItem = new Map<string, number>();
  for (const s of sales ?? []) {
    soldByItem.set(s.catalog_item_id, (soldByItem.get(s.catalog_item_id) ?? 0) + 1);
  }

  const failures: string[] = [];
  let receivedCount = 0;
  for (const a of allocations ?? []) {
    const returnable = Math.max(
      a.quantity_allocated - a.quantity_returned - (soldByItem.get(a.catalog_item_id) ?? 0),
      0,
    );
    if (returnable <= 0) continue;
    const { error } = await supabase.rpc("receive_allocation_return", {
      p_allocation_id: a.id,
      p_quantity: returnable,
    });
    if (error) {
      failures.push(error.message);
    } else {
      receivedCount += 1;
    }
  }

  revalidatePath(pagePath(fairId));
  if (receivedCount === 0 && failures.length === 0) {
    withError(fairId, "Nothing returnable to receive");
  }
  if (failures.length > 0) {
    withError(
      fairId,
      `Received ${receivedCount} item(s); ${failures.length} failed: ${failures.join("; ")}`,
    );
  }
  redirect(pagePath(fairId));
}
