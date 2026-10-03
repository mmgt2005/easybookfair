"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuthor } from "@/lib/auth";

// Next.js redacts a thrown Server Action error's message in production —
// this returns { error } as ordinary data instead (same pattern as
// updateFundraiserGoal/updateFairSalesTax), so the caller needs
// useTransition rather than a bare <form action={...}>.
export type ActionResult = { error?: string };

function normalizeWebsite(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Lets an author edit only their own bio/website — name/email/phone stay
// admin-only (app/admin/authors/actions.ts). Goes through
// update_author_profile() (migration 0069), a security-definer RPC scoped
// to "self or admin", since authors has no author-self UPDATE policy —
// same reasoning as updateFundraiserGoal()/updateFairSalesTax().
export async function updateAuthorProfile(formData: FormData): Promise<ActionResult> {
  const { authorUserId } = await requireAuthor();
  const supabase = await createClient();

  const bio = String(formData.get("bio") ?? "").trim() || null;
  const website = normalizeWebsite(String(formData.get("website") ?? ""));

  const { error } = await supabase.rpc("update_author_profile", {
    p_author_user_id: authorUserId,
    p_bio: bio,
    p_website: website,
  });
  if (error) return { error: error.message };

  revalidatePath("/author");
  revalidatePath(`/authors/${authorUserId}`);
  return {};
}

// Accept/decline an inventory request — the actual authorization check
// (only this request's own author, or an admin) lives in
// respond_to_inventory_request() (migration 0071) itself; requireAuthor()
// here is the same page-level gate every other author action already has,
// not a substitute for that RPC-level check. Accepting without the terms
// checkbox checked (RespondToRequestButtons.tsx) still gets rejected
// server-side by that RPC (migration 0075) — the disabled Accept button
// is convenience, not the boundary.
export async function respondToInventoryRequest(
  requestId: string,
  accept: boolean,
  formData: FormData,
) {
  await requireAuthor();
  const supabase = await createClient();
  const authorNote = String(formData.get("author_note") ?? "").trim() || null;
  const termsAcknowledged = String(formData.get("terms_acknowledged") ?? "") === "true";

  const { error } = await supabase.rpc("respond_to_inventory_request", {
    p_request_id: requestId,
    p_accept: accept,
    p_author_note: authorNote,
    p_terms_acknowledged: termsAcknowledged,
  });

  revalidatePath("/author");
  if (error) {
    redirect(`/author?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/author");
}

// Lets the author (or admin) record/update the shipment tracking number
// once a request has been accepted — mirrors respondToInventoryRequest's
// shape exactly; the real "accepted or later" enforcement lives in
// set_inventory_request_tracking_number() (migration 0074) itself.
export async function setInventoryRequestTrackingNumber(requestId: string, formData: FormData) {
  await requireAuthor();
  const supabase = await createClient();
  const trackingNumber = String(formData.get("tracking_number") ?? "").trim() || null;

  const { error } = await supabase.rpc("set_inventory_request_tracking_number", {
    p_request_id: requestId,
    p_tracking_number: trackingNumber,
  });

  revalidatePath("/author");
  if (error) {
    redirect(`/author?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/author");
}
