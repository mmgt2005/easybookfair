"use server";

import { createClient } from "@/lib/supabase/server";

export type AuthorMessage = {
  id: string;
  sender_role: "author" | "admin";
  body: string;
  created_at: string;
  attachment_url: string | null;
  attachment_filename: string | null;
  attachment_content_type: string | null;
};

// Shared by both sides of the thread (app/author/(portal)/messages and
// app/admin/authors/[id]/messages) — lives under the admin tree and is
// imported by the author side, same "owning side holds the shared logic,
// the other side imports it" shape already used by
// MarketingToolkitContent (app/admin/fairs/[fairId]/marketing), to avoid
// duplicating the same query/insert logic twice. Called directly as a
// function from AuthorMessagesClient's poll loop (not a <form action>),
// same as SalesFeedClient's getRecentSales — no revalidatePath needed
// since the client re-fetches imperatively on its own schedule.
export async function getAuthorMessages(authorUserId: string): Promise<AuthorMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("author_messages")
    .select(
      "id, sender_role, body, created_at, attachment_url, attachment_filename, attachment_content_type",
    )
    .eq("author_user_id", authorUserId)
    .order("created_at", { ascending: true });
  return (data ?? []) as AuthorMessage[];
}

// Derives the sender's role server-side from who's actually signed in
// (platform_admins membership, else must be this exact author) — never
// trusted from the client, same reasoning as submitAuthorSubmission's own
// authorUserId derivation. A different author attempting to post into
// someone else's thread is rejected here before ever reaching the
// RLS-level author_messages_author_insert check.
export async function sendAuthorMessage(authorUserId: string, formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: adminRow } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const senderRole: "author" | "admin" = adminRow ? "admin" : "author";

  if (senderRole === "author" && user.id !== authorUserId) {
    throw new Error("Not authorized");
  }

  const body = String(formData.get("body") ?? "").trim();
  const file = formData.get("attachment") as File | null;
  const hasFile = !!file && file.size > 0;
  if (!body && !hasFile) return;

  let attachmentUrl: string | null = null;
  if (hasFile) {
    const extension = file!.name.split(".").pop() || "bin";
    const path = `${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("message-attachments")
      .upload(path, file!, { contentType: file!.type });
    if (uploadError) throw new Error(`Attachment upload failed: ${uploadError.message}`);
    attachmentUrl = supabase.storage.from("message-attachments").getPublicUrl(path).data.publicUrl;
  }

  const { error } = await supabase.from("author_messages").insert({
    author_user_id: authorUserId,
    sender_role: senderRole,
    sender_user_id: user.id,
    body,
    attachment_url: attachmentUrl,
    attachment_filename: hasFile ? file!.name : null,
    attachment_content_type: hasFile ? file!.type : null,
  });
  if (error) throw new Error(error.message);
}

export async function markMessagesRead(authorUserId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("mark_author_messages_read", { p_author_user_id: authorUserId });
}
