"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function pagePath(fairId: string) {
  return `/admin/fairs/${fairId}/wallets`;
}

// Sweeps every active wallet's remaining balance into the org payout
// (close_wallets_for_fair, migration 0022) — irreversible, so this is a
// deliberate manual action, same posture as the rest of "closing a fair"
// being manual until the full settlement engine exists.
export async function closeWalletsForFair(fairId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_wallets_for_fair", { p_fair_id: fairId });

  revalidatePath(pagePath(fairId));
  if (error) {
    redirect(`${pagePath(fairId)}?error=${encodeURIComponent(error.message)}`);
  }
  redirect(pagePath(fairId));
}
