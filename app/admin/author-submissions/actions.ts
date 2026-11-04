"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { siteUrl } from "@/lib/email";
import { inviteOrFindAccount } from "@/lib/accounts";

type CoreResult = { ok: true } | { ok: false; error: string };

// The exact body of approveAuthorSubmission (below), minus the
// redirects — a mechanical, behavior-preserving extraction so the same
// multi-step procedure (account invite, catalog insert, link the
// submission) can run once per id in approveManyAuthorSubmissions's
// loop without each iteration's redirect() aborting the batch. The
// single-item action is now a thin wrapper around this; it must keep
// producing the exact same redirects it always has.
async function approveAuthorSubmissionCore(submissionId: string): Promise<CoreResult> {
  const service = createServiceClient();

  const { data: submission, error: fetchError } = await service
    .from("author_submissions")
    .select(
      "author_name, author_email, author_phone, title, description, item_type, category, front_cover_image_url, suggested_retail_price, wholesale_price, status",
    )
    .eq("id", submissionId)
    .single();

  if (fetchError || !submission) {
    return { ok: false, error: "Submission not found" };
  }
  if (submission.status !== "pending") {
    return { ok: false, error: "Submission already reviewed" };
  }

  // Create the author's account, inviting them by email (Supabase's own
  // invite flow — no Resend involved here, this is Supabase Auth's
  // built-in email).
  let authorUserId: string;
  try {
    authorUserId = await inviteOrFindAccount(
      service,
      submission.author_email,
      `${siteUrl()}/auth/invite?next=/author`,
      { kind: "author_submission_approved", bookTitle: submission.title },
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not create or find an account",
    };
  }

  const { error: authorUpsertError } = await service
    .from("authors")
    .upsert({
      user_id: authorUserId,
      name: submission.author_name,
      email: submission.author_email,
      phone: submission.author_phone,
    });
  if (authorUpsertError) {
    return { ok: false, error: authorUpsertError.message };
  }

  const { data: catalogItem, error: catalogError } = await service
    .from("catalog_items")
    .insert({
      title: submission.title,
      item_type: submission.item_type,
      category: submission.category,
      description: submission.description,
      image_url: submission.front_cover_image_url,
      price: submission.suggested_retail_price,
      cost: submission.wholesale_price,
    })
    .select("id")
    .single();
  if (catalogError) {
    return { ok: false, error: catalogError.message };
  }

  const { error: updateError } = await service
    .from("author_submissions")
    .update({ status: "approved", author_user_id: authorUserId, catalog_item_id: catalogItem!.id })
    .eq("id", submissionId);

  revalidatePath("/admin/author-submissions");
  revalidatePath("/admin/catalog");
  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  return { ok: true };
}

// Approving does three things atomically-ish (best-effort, not a single
// DB transaction — see the comment on the account lookup inside the core
// function for why that's an acceptable trade-off here): finds or
// creates a real account for the author, adds the submission to the
// catalog at its computed wholesale cost, and links the submission to
// both.
export async function approveAuthorSubmission(submissionId: string) {
  await requireAdmin();
  const result = await approveAuthorSubmissionCore(submissionId);
  if (!result.ok) {
    redirect(`/admin/author-submissions?error=${encodeURIComponent(result.error)}`);
  }
  redirect("/admin/author-submissions");
}

// Bulk approve — same core procedure run once per id, sequentially (not
// Promise.all: each id does a real Supabase Admin API invite call plus a
// catalog_items insert; running concurrently risks rate-limiting and
// makes partial-failure bookkeeping harder to reason about). Never
// aborts the batch on one failure; redirects once with a summary of how
// many succeeded.
export async function approveManyAuthorSubmissions(formData: FormData) {
  await requireAdmin();
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) {
    redirect(
      `/admin/author-submissions?error=${encodeURIComponent("Select at least one submission")}`,
    );
  }

  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of ids) {
    const result = await approveAuthorSubmissionCore(id);
    results.push({ id, ...result });
  }

  const failed = results.filter((r) => !r.ok);
  const message =
    failed.length === 0
      ? null
      : `Approved ${results.length - failed.length} of ${results.length}. Failed: ${failed
          .map((f) => f.error)
          .join("; ")}`;

  redirect(
    message
      ? `/admin/author-submissions?error=${encodeURIComponent(message)}`
      : "/admin/author-submissions",
  );
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

// Decline has no side effects, so the bulk version is just the same
// update scoped to many ids in one query — no core extraction or loop
// needed.
export async function declineManyAuthorSubmissions(formData: FormData) {
  await requireAdmin();
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) {
    redirect(
      `/admin/author-submissions?error=${encodeURIComponent("Select at least one submission")}`,
    );
  }
  const supabase = await createClient();
  const adminNote = String(formData.get("admin_note") ?? "").trim() || null;

  const { error } = await supabase
    .from("author_submissions")
    .update({ status: "declined", admin_note: adminNote })
    .in("id", ids)
    .eq("status", "pending");

  revalidatePath("/admin/author-submissions");
  if (error) {
    redirect(`/admin/author-submissions?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/admin/author-submissions");
}
