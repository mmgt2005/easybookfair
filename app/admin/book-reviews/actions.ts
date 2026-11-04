"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function approveBookReview(reviewId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("book_reviews")
    .update({ status: "approved" })
    .eq("id", reviewId)
    .eq("status", "pending");

  revalidatePath("/admin/book-reviews");
  if (error) {
    redirect(`/admin/book-reviews?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/admin/book-reviews");
}

export async function declineBookReview(reviewId: string, formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const adminNote = String(formData.get("admin_note") ?? "").trim() || null;

  const { error } = await supabase
    .from("book_reviews")
    .update({ status: "declined", admin_note: adminNote })
    .eq("id", reviewId)
    .eq("status", "pending");

  revalidatePath("/admin/book-reviews");
  if (error) {
    redirect(`/admin/book-reviews?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/admin/book-reviews");
}

// Pure status flip with zero side effects, so a bulk approve/decline is
// just the same update scoped to many ids in one query — no per-row
// loop needed, unlike the queues that create a real account/row/email
// on approve (fair-requests, org-signups, author-submissions).
export async function approveManyBookReviews(formData: FormData) {
  await requireAdmin();
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) {
    redirect(`/admin/book-reviews?error=${encodeURIComponent("Select at least one review")}`);
  }
  const supabase = await createClient();

  const { error } = await supabase
    .from("book_reviews")
    .update({ status: "approved" })
    .in("id", ids)
    .eq("status", "pending");

  revalidatePath("/admin/book-reviews");
  if (error) {
    redirect(`/admin/book-reviews?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/admin/book-reviews");
}

export async function declineManyBookReviews(formData: FormData) {
  await requireAdmin();
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) {
    redirect(`/admin/book-reviews?error=${encodeURIComponent("Select at least one review")}`);
  }
  const supabase = await createClient();
  const adminNote = String(formData.get("admin_note") ?? "").trim() || null;

  const { error } = await supabase
    .from("book_reviews")
    .update({ status: "declined", admin_note: adminNote })
    .in("id", ids)
    .eq("status", "pending");

  revalidatePath("/admin/book-reviews");
  if (error) {
    redirect(`/admin/book-reviews?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/admin/book-reviews");
}
