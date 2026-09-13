"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Public — no login required (RLS's author_submissions_insert policy
// allows anon, requiring author_user_id be null in that case; a signed-in
// author submitting a follow-up item passes their own id via the hidden
// field the page sets, and RLS rejects anything else, so there's nothing
// extra to check here).
export async function submitAuthorSubmission(formData: FormData) {
  const supabase = await createClient();

  const authorUserId = String(formData.get("author_user_id") ?? "").trim() || null;
  const authorName = String(formData.get("author_name") ?? "").trim();
  const authorEmail = String(formData.get("author_email") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const itemType = String(formData.get("item_type") ?? "book");
  const category = String(formData.get("category") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const suggestedRetailPrice = Number(formData.get("suggested_retail_price") ?? NaN);

  if (
    !authorName ||
    !authorEmail ||
    !title ||
    !Number.isFinite(suggestedRetailPrice) ||
    suggestedRetailPrice <= 0
  ) {
    redirect(
      `/author/submit?error=${encodeURIComponent(
        "Name, email, title, and a positive suggested price are required",
      )}`,
    );
  }

  let imageUrl: string | null = null;
  const imageFile = formData.get("image") as File | null;
  if (imageFile && imageFile.size > 0) {
    const extension = imageFile.name.split(".").pop() || "jpg";
    const path = `${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("author-submissions")
      .upload(path, imageFile, { contentType: imageFile.type });
    if (uploadError) {
      redirect(
        `/author/submit?error=${encodeURIComponent(`Image upload failed: ${uploadError.message}`)}`,
      );
    }
    imageUrl = supabase.storage.from("author-submissions").getPublicUrl(path).data.publicUrl;
  }

  const { error } = await supabase.from("author_submissions").insert({
    author_user_id: authorUserId,
    author_name: authorName,
    author_email: authorEmail,
    title,
    item_type: itemType,
    category,
    description,
    image_url: imageUrl,
    suggested_retail_price: suggestedRetailPrice,
  });

  if (error) {
    redirect(`/author/submit?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/author/submit?success=1");
}
