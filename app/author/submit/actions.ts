"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewAsAuthorId } from "@/lib/viewAs";

// Public — no login required. author_user_id is derived here, server-side
// — never trusted from a hidden form field — since migration 0041 added
// an unconditional admin insert policy (needed so an admin "viewing as"
// an author, lib/viewAs.ts, can submit on their behalf); trusting client
// input for this once that policy exists would let any authenticated
// admin claim to be any author. A plain signed-in author (not an admin)
// submitting a follow-up item still only ever gets their own id, via the
// same `authors` lookup requireAuthor() uses.
export async function submitAuthorSubmission(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let authorUserId: string | null = null;
  let submittedByAdminId: string | null = null;

  if (user) {
    const viewAsAuthorId = await getViewAsAuthorId();
    if (viewAsAuthorId) {
      const { data: adminRow } = await supabase
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (adminRow) {
        authorUserId = viewAsAuthorId;
        submittedByAdminId = user.id;
      }
    }

    if (!authorUserId) {
      const { data: authorRow } = await supabase
        .from("authors")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (authorRow) {
        authorUserId = authorRow.user_id;
      }
    }
  }

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

  async function uploadSubmissionFile(fieldName: string, label: string): Promise<string | null> {
    const file = formData.get(fieldName) as File | null;
    if (!file || file.size === 0) return null;
    const extension = file.name.split(".").pop() || "bin";
    const path = `${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("author-submissions")
      .upload(path, file, { contentType: file.type });
    if (uploadError) {
      redirect(
        `/author/submit?error=${encodeURIComponent(`${label} upload failed: ${uploadError.message}`)}`,
      );
    }
    return supabase.storage.from("author-submissions").getPublicUrl(path).data.publicUrl;
  }

  const frontCoverUrl = await uploadSubmissionFile("front_cover", "Front cover");
  const backCoverUrl = await uploadSubmissionFile("back_cover", "Back cover");
  const interiorPdfUrl = await uploadSubmissionFile("interior_pdf", "Interior PDF");

  const { error } = await supabase.from("author_submissions").insert({
    author_user_id: authorUserId,
    submitted_by_admin_id: submittedByAdminId,
    author_name: authorName,
    author_email: authorEmail,
    title,
    item_type: itemType,
    category,
    description,
    front_cover_image_url: frontCoverUrl,
    back_cover_image_url: backCoverUrl,
    interior_pdf_url: interiorPdfUrl,
    suggested_retail_price: suggestedRetailPrice,
  });

  if (error) {
    redirect(`/author/submit?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/author/submit?success=1");
}
