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
