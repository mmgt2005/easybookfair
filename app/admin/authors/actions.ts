"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { setViewAsAuthor } from "@/lib/viewAs";
import { inviteOrFindAuthorAccount } from "@/lib/authors";
import { siteUrl } from "@/lib/email";

// Edits the authors row itself — name/email/phone shown across the app
// (event-request review, the author portal's own header). Deliberately
// does not touch the underlying Supabase Auth account: changing the
// login email is a separate, riskier operation (re-confirmation, losing
// access to the old inbox) that nothing here asks for. A changed email
// does change which catalog items this author's own portal matches via
// author_email (see app/author/(portal)/page.tsx) — the edit page notes
// that.
export async function updateAuthor(authorUserId: string, formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;

  if (!name || !email) {
    throw new Error("Name and email are required");
  }

  const { error } = await supabase
    .from("authors")
    .update({ name, email, phone })
    .eq("user_id", authorUserId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/authors");
  redirect("/admin/authors");
}

// For an author who was never submitted through /author/submit — only
// added as plain contact info on a catalog item (author_name/author_email/
// author_phone, migration 0051). Only fires on this explicit admin click,
// never automatically when those fields are saved, since it sends a real
// account-invite email to whoever is listed.
export async function createAuthorAccountAndViewAs(formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  if (!name || !email) {
    redirect(`/admin/authors?error=${encodeURIComponent("Name and email are required")}`);
  }

  const service = createServiceClient();
  let userId: string;
  try {
    userId = await inviteOrFindAuthorAccount(service, email, `${siteUrl()}/author`);
  } catch (err) {
    redirect(
      `/admin/authors?error=${encodeURIComponent(
        err instanceof Error ? err.message : "Could not create or find an account",
      )}`,
    );
  }

  const { error } = await service.from("authors").upsert({ user_id: userId, name, email, phone });
  if (error) {
    redirect(`/admin/authors?error=${encodeURIComponent(error.message)}`);
  }

  await setViewAsAuthor(userId);
  redirect("/author");
}
