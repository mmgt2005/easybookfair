"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { siteUrl } from "@/lib/email";

// Approving does three things atomically-ish (best-effort, not a single
// DB transaction — see the comment on the account lookup below for why
// that's an acceptable trade-off here): finds or creates a real account
// for the author, adds the submission to the catalog at its computed
// wholesale cost, and links the submission to both.
export async function approveAuthorSubmission(submissionId: string) {
  await requireAdmin();
  const service = createServiceClient();

  const { data: submission, error: fetchError } = await service
    .from("author_submissions")
    .select(
      "author_name, author_email, author_phone, title, description, item_type, category, front_cover_image_url, suggested_retail_price, wholesale_price, status",
    )
    .eq("id", submissionId)
    .single();

  if (fetchError || !submission) {
    redirect(`/admin/author-submissions?error=${encodeURIComponent("Submission not found")}`);
  }
  if (submission!.status !== "pending") {
    redirect(`/admin/author-submissions?error=${encodeURIComponent("Submission already reviewed")}`);
  }

  // Create the author's account, inviting them by email (Supabase's own
  // invite flow — no Resend involved here, this is Supabase Auth's
  // built-in email). A returning author whose email is already registered
  // makes this error instead of creating a duplicate account — fall back
  // to finding their existing user id rather than failing the approval.
  let authorUserId: string;
  const invite = await service.auth.admin.inviteUserByEmail(submission!.author_email, {
    redirectTo: `${siteUrl()}/author`,
  });

  if (invite.error) {
    const { data: existing, error: listError } = await service.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const match = existing?.users.find(
      (u) => u.email?.toLowerCase() === submission!.author_email.toLowerCase(),
    );
    if (listError || !match) {
      redirect(
        `/admin/author-submissions?error=${encodeURIComponent(
          `Could not create or find an account for ${submission!.author_email}: ${invite.error.message}`,
        )}`,
      );
    }
    authorUserId = match!.id;
  } else {
    authorUserId = invite.data.user.id;
  }

  const { error: authorUpsertError } = await service
    .from("authors")
    .upsert({
      user_id: authorUserId,
      name: submission!.author_name,
      email: submission!.author_email,
      phone: submission!.author_phone,
    });
  if (authorUpsertError) {
    redirect(`/admin/author-submissions?error=${encodeURIComponent(authorUpsertError.message)}`);
  }

  const { data: catalogItem, error: catalogError } = await service
    .from("catalog_items")
    .insert({
      title: submission!.title,
      item_type: submission!.item_type,
      category: submission!.category,
      description: submission!.description,
      image_url: submission!.front_cover_image_url,
      price: submission!.suggested_retail_price,
      cost: submission!.wholesale_price,
    })
    .select("id")
    .single();
  if (catalogError) {
    redirect(`/admin/author-submissions?error=${encodeURIComponent(catalogError.message)}`);
  }

  const { error: updateError } = await service
    .from("author_submissions")
    .update({ status: "approved", author_user_id: authorUserId, catalog_item_id: catalogItem!.id })
    .eq("id", submissionId);

  revalidatePath("/admin/author-submissions");
  revalidatePath("/admin/catalog");
  if (updateError) {
    redirect(`/admin/author-submissions?error=${encodeURIComponent(updateError.message)}`);
  }

  redirect("/admin/author-submissions");
}

export async function declineAuthorSubmission(submissionId: string, formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const adminNote = String(formData.get("admin_note") ?? "").trim() || null;

  const { error } = await supabase
    .from("author_submissions")
    .update({ status: "declined", admin_note: adminNote })
    .eq("id", submissionId)
    .eq("status", "pending");

  revalidatePath("/admin/author-submissions");
  if (error) {
    redirect(`/admin/author-submissions?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/admin/author-submissions");
}
