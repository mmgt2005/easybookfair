"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFairStaff } from "@/lib/auth";
import { sendWalletDonationReceiptEmail, siteUrl } from "@/lib/email";

function pagePath(fairId: string) {
  return `/admin/fairs/${fairId}/wallets`;
}

// Sweeps every active wallet's remaining balance into the org payout
// (close_wallets_for_fair, migration 0022) — irreversible, so this is a
// deliberate manual action, same posture as the rest of "closing a fair"
// being manual until the full settlement engine exists.
export async function closeWalletsForFair(fairId: string) {
  await requireFairStaff(fairId);
  const supabase = await createClient();

  // Captured *before* closing — close_wallets_for_fair() zeroes balance
  // (donated_amount is what survives), and a wallet can have more than one
  // funding, so this takes the most recent parent_email per wallet as the
  // best guess of who to notify. A wallet never funded online (or funded
  // before parent_email existed, migration 0028) has no email on file and
  // is silently skipped — there's no other contact to send to.
  const { data: toNotify } = await supabase
    .from("student_wallets")
    .select("id, student_name, balance, wallet_fundings(parent_email, created_at)")
    .eq("fair_id", fairId)
    .eq("status", "active")
    .gt("balance", 0);

  const { error } = await supabase.rpc("close_wallets_for_fair", { p_fair_id: fairId });

  revalidatePath(pagePath(fairId));
  if (error) {
    redirect(`${pagePath(fairId)}?error=${encodeURIComponent(error.message)}`);
  }

  const { data: fair } = await supabase.from("fairs").select("name").eq("id", fairId).single();

  for (const wallet of toNotify ?? []) {
    const fundings = (wallet.wallet_fundings ?? []) as { parent_email: string | null; created_at: string }[];
    const latestEmail = fundings
      .filter((f) => f.parent_email)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.parent_email;

    if (!latestEmail || !fair) continue;

    try {
      await sendWalletDonationReceiptEmail({
        to: latestEmail,
        studentName: wallet.student_name,
        fairName: fair.name,
        donatedAmount: wallet.balance,
        receiptUrl: `${siteUrl()}/fairs/${fairId}/wallet/receipt/${wallet.id}`,
      });
    } catch (emailError) {
      console.error("Failed to send wallet donation receipt email", emailError);
    }
  }

  redirect(pagePath(fairId));
}
