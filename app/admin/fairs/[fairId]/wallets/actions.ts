"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFairStaff } from "@/lib/auth";
import { sendWalletDonationReceiptEmail, sendPoolCloseoutSummaryEmail, siteUrl } from "@/lib/email";

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

  // Notify every donor_stripe pool contributor with the fair's overall
  // impact (migration 0060) — org_recorded donations have no captured
  // email to notify. Best-effort, same posture as the loop above; skips
  // entirely if no donor left an email on file.
  const { data: poolDonors } = await supabase
    .from("wallet_pool_fundings")
    .select("donor_email")
    .eq("fair_id", fairId)
    .eq("source", "donor_stripe")
    .not("donor_email", "is", null);

  const uniqueDonorEmails = [...new Set((poolDonors ?? []).map((d) => d.donor_email!))];

  if (uniqueDonorEmails.length > 0 && fair) {
    const { data: poolSummary } = await supabase
      .from("wallet_pools")
      .select("students_helped_count, total_assisted, swept_amount")
      .eq("fair_id", fairId)
      .maybeSingle();

    if (poolSummary) {
      for (const email of uniqueDonorEmails) {
        try {
          await sendPoolCloseoutSummaryEmail({
            to: email,
            fairName: fair.name,
            studentsHelped: poolSummary.students_helped_count ?? 0,
            totalAssisted: Number(poolSummary.total_assisted ?? 0),
            sweptAmount: Number(poolSummary.swept_amount ?? 0),
            receiptUrl: `${siteUrl()}/fairs/${fairId}/wallet/pool-receipt`,
          });
        } catch (emailError) {
          console.error("Failed to send pool closeout summary email", emailError);
        }
      }
    }
  }

  redirect(pagePath(fairId));
}

// Records a donation already collected outside the app (cash, check, a
// sponsor) directly into this fair's shared wallet assistance pool
// (record_pool_donation, migration 0059) — no Stripe payment involved,
// same "money already in hand, just record it" posture as recording a
// cash sale.
export async function recordPoolDonation(fairId: string, formData: FormData) {
  await requireFairStaff(fairId);
  const supabase = await createClient();

  const amount = Number(formData.get("amount"));
  const note = String(formData.get("note") ?? "").trim() || null;

  const { error } = await supabase.rpc("record_pool_donation", {
    p_fair_id: fairId,
    p_amount: amount,
    p_note: note,
  });

  revalidatePath(pagePath(fairId));
  if (error) {
    redirect(`${pagePath(fairId)}?error=${encodeURIComponent(error.message)}`);
  }
  redirect(pagePath(fairId));
}
