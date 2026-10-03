"use server";

import { createClient } from "@/lib/supabase/server";
import { checkForSpam } from "@/lib/spamGuard";

export type ActionResult = { error?: string; success?: boolean };

// Public, unauthenticated — anyone can submit a review for any catalog
// item (no purchase verification, per the product owner's decision: a
// strict check would have silently excluded every in-person buyer, since
// checkout_sessions.buyer_email is only ever captured for the 'online'
// channel). Admin approval before it's ever publicly visible
// (book_reviews_select_public, migration 0073) is the sole gate —
// Turnstile + honeypot here carry the anti-abuse weight that
// purchase-verification would otherwise have.
export async function submitBookReview(
  catalogItemId: string,
  formData: FormData,
): Promise<ActionResult> {
  const reviewerName = String(formData.get("reviewer_name") ?? "").trim();
  const reviewerEmail = String(formData.get("reviewer_email") ?? "").trim();
  const rating = Number(formData.get("rating"));
  const reviewText = String(formData.get("review_text") ?? "").trim() || null;

  if (!reviewerName || !reviewerEmail || !Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { error: "Name, email, and a star rating are required." };
  }

  const spamCheck = await checkForSpam({
    turnstileToken: formData.get("cf-turnstile-response") as string | null,
    email: reviewerEmail,
    honeypot: formData.get("company") as string | null,
  });
  if (spamCheck.blocked) {
    // A tripped honeypot fails silently — same posture as every other
    // public form in this app (never reveal the trap exists).
    if (spamCheck.silent) return { success: true };
    return { error: spamCheck.message };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("book_reviews").insert({
    catalog_item_id: catalogItemId,
    reviewer_name: reviewerName,
    reviewer_email: reviewerEmail,
    rating,
    review_text: reviewText,
  });
  if (error) return { error: error.message };

  return { success: true };
}
