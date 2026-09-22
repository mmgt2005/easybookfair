"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
import { isPlatformAdmin } from "@/lib/auth";

// Public, guest funding flow — no buyer login exists. Re-checks the
// org.is_school gate server-side (not just hiding the UI), since a client
// could otherwise call this action directly for a non-school org's fair.
export async function createWalletFunding(
  fairId: string,
  studentName: string,
  grade: string,
  teacher: string,
  amount: number,
  parentEmail: string,
) {
  if (!studentName.trim()) {
    throw new Error("Student name is required");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be positive");
  }
  if (!parentEmail.trim()) {
    throw new Error("Email is required");
  }

  const service = createServiceClient();

  const { data: fair } = await service
    .from("fairs")
    .select("org_id, allow_wallet")
    .eq("id", fairId)
    .single();
  if (!fair) {
    throw new Error("Fair not found");
  }
  if (!fair.allow_wallet) {
    throw new Error("Student wallets aren't available for this fair");
  }

  const { data: org } = await service
    .from("organizations")
    .select("is_school, is_demo, is_demo_enabled")
    .eq("id", fair.org_id)
    .single();
  if (!org?.is_school) {
    throw new Error("Student wallets aren't available for this fair");
  }
  if (org.is_demo && (!org.is_demo_enabled || !(await isPlatformAdmin()))) {
    throw new Error("This demo fair isn't available");
  }

  const gradeTrimmed = grade.trim() || null;
  const teacherTrimmed = teacher.trim() || null;

  // Top up an existing wallet for the same student/grade/teacher at this
  // fair rather than creating a duplicate each time a parent adds funds.
  let lookup = service
    .from("student_wallets")
    .select("id, status")
    .eq("fair_id", fairId)
    .eq("student_name", studentName.trim());
  lookup = gradeTrimmed ? lookup.eq("grade", gradeTrimmed) : lookup.is("grade", null);
  lookup = teacherTrimmed ? lookup.eq("teacher", teacherTrimmed) : lookup.is("teacher", null);

  const { data: existing } = await lookup.maybeSingle();

  let walletId: string;
  if (existing) {
    if (existing.status !== "active") {
      throw new Error("This wallet has already been closed out for this fair");
    }
    walletId = existing.id;
  } else {
    const { data: inserted, error: insertError } = await service
      .from("student_wallets")
      .insert({
        fair_id: fairId,
        student_name: studentName.trim(),
        grade: gradeTrimmed,
        teacher: teacherTrimmed,
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);
    walletId = inserted.id;
  }

  const { data: funding, error: fundingError } = await service
    .from("wallet_fundings")
    .insert({ wallet_id: walletId, amount, parent_email: parentEmail.trim() })
    .select("id")
    .single();
  if (fundingError) throw new Error(fundingError.message);

  const paymentIntent = await getStripe().paymentIntents.create({
    amount: Math.round(amount * 100),
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    metadata: { wallet_funding_id: funding.id, kind: "wallet_funding" },
  });

  const { error: updateError } = await service
    .from("wallet_fundings")
    .update({ payment_intent_id: paymentIntent.id })
    .eq("id", funding.id);
  if (updateError) throw new Error(updateError.message);

  return { clientSecret: paymentIntent.client_secret as string };
}

// Same public, guest, no-login flow as createWalletFunding above, except
// this money isn't earmarked for one named student — it funds the fair's
// shared wallet assistance pool (migration 0059), which the checkout
// flow draws from automatically for any qualifying student.
export async function createPoolFunding(fairId: string, amount: number, donorEmail: string) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be positive");
  }
  if (!donorEmail.trim()) {
    throw new Error("Email is required");
  }

  const service = createServiceClient();

  const { data: fair } = await service
    .from("fairs")
    .select("org_id, allow_wallet")
    .eq("id", fairId)
    .single();
  if (!fair) {
    throw new Error("Fair not found");
  }
  if (!fair.allow_wallet) {
    throw new Error("Student wallets aren't available for this fair");
  }

  const { data: org } = await service
    .from("organizations")
    .select("is_school, is_demo, is_demo_enabled")
    .eq("id", fair.org_id)
    .single();
  if (!org?.is_school) {
    throw new Error("Student wallets aren't available for this fair");
  }
  if (org.is_demo && (!org.is_demo_enabled || !(await isPlatformAdmin()))) {
    throw new Error("This demo fair isn't available");
  }

  const { data: funding, error: fundingError } = await service
    .from("wallet_pool_fundings")
    .insert({ fair_id: fairId, source: "donor_stripe", amount, donor_email: donorEmail.trim() })
    .select("id")
    .single();
  if (fundingError) throw new Error(fundingError.message);

  const paymentIntent = await getStripe().paymentIntents.create({
    amount: Math.round(amount * 100),
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    metadata: { pool_funding_id: funding.id, kind: "wallet_pool_funding" },
  });

  const { error: updateError } = await service
    .from("wallet_pool_fundings")
    .update({ payment_intent_id: paymentIntent.id })
    .eq("id", funding.id);
  if (updateError) throw new Error(updateError.message);

  return { clientSecret: paymentIntent.client_secret as string };
}
