"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { setViewAsAuthor } from "@/lib/viewAs";
import { inviteOrFindAccount } from "@/lib/accounts";
import { siteUrl, sendInventoryRequestEmail } from "@/lib/email";
import { renderInventoryTermsTemplate } from "@/lib/inventoryTerms";

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
    userId = await inviteOrFindAccount(service, email, `${siteUrl()}/author`);
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

function inventoryPath(authorUserId: string) {
  return `/admin/authors/${authorUserId}/inventory`;
}

type RequestedLine = { catalogItemId: string; quantity: number; cost: number };

function parseLines(formData: FormData): RequestedLine[] | null {
  const raw = String(formData.get("items_json") ?? "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  const lines: RequestedLine[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) return null;
    const { catalogItemId, quantity, cost } = entry as Record<string, unknown>;
    const q = Number(quantity);
    const c = Number(cost);
    if (
      typeof catalogItemId !== "string" ||
      !catalogItemId ||
      !Number.isFinite(q) ||
      q <= 0 ||
      !Number.isFinite(c) ||
      c < 0
    ) {
      return null;
    }
    lines.push({ catalogItemId, quantity: q, cost: c });
  }
  return lines;
}

// Proposes a restock of one or more existing catalog items directly to
// the author who supplies them — one request (one Accept/Decline
// decision, one legal agreement) can now cover several books at once
// (author_inventory_request_items, migration 0074). wholesale_cost_per_unit
// is prefilled client-side from catalog_items.cost but stored as its own
// snapshot per line (migration 0071's own comment explains why: a later
// cost change shouldn't retroactively change what was actually proposed).
// terms_text is now the standardized template (inventory_terms_versions,
// migration 0075) merged with this request's real line items, not
// admin-typed free text. Best-effort email, same posture as every other
// notification in this app — a failed send never blocks the request from
// being created.
export async function createInventoryRequest(authorUserId: string, formData: FormData) {
  const { user } = await requireAdmin();
  const supabase = await createClient();

  const lines = parseLines(formData);
  if (!lines) {
    redirect(
      `${inventoryPath(authorUserId)}?error=${encodeURIComponent(
        "At least one book, each with a positive quantity and a non-negative wholesale cost, is required",
      )}`,
    );
  }

  const catalogItemIds = lines!.map((l) => l.catalogItemId);
  const { data: books } = await supabase
    .from("catalog_items")
    .select("id, title")
    .in("id", catalogItemIds);
  const titleById = new Map((books ?? []).map((b) => [b.id, b.title]));

  const { data: author } = await supabase
    .from("authors")
    .select("name, email")
    .eq("user_id", authorUserId)
    .single();

  const { data: currentTerms } = await supabase
    .from("inventory_terms_versions")
    .select("version, terms_text")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lineItemsForTerms = lines!.map((l) => ({
    bookTitle: titleById.get(l.catalogItemId) ?? "Unknown book",
    quantity: l.quantity,
    wholesaleCostPerUnit: l.cost,
    wholesaleAmountTotal: l.quantity * l.cost,
  }));

  const termsText = currentTerms
    ? renderInventoryTermsTemplate(currentTerms.terms_text, {
        lineItems: lineItemsForTerms,
        authorName: author?.name ?? "the author",
        requestDate: new Date().toLocaleDateString(),
      })
    : null;

  const { data: request, error } = await supabase
    .from("author_inventory_requests")
    .insert({
      author_user_id: authorUserId,
      terms_text: termsText,
      terms_version: currentTerms?.version ?? null,
      requested_by: user.id,
    })
    .select("id")
    .single();

  if (error || !request) {
    redirect(
      `${inventoryPath(authorUserId)}?error=${encodeURIComponent(error?.message ?? "Failed to create request")}`,
    );
  }

  const { error: itemsError } = await supabase.from("author_inventory_request_items").insert(
    lines!.map((l) => ({
      request_id: request.id,
      catalog_item_id: l.catalogItemId,
      quantity_requested: l.quantity,
      wholesale_cost_per_unit: l.cost,
    })),
  );

  revalidatePath(inventoryPath(authorUserId));
  if (itemsError) {
    redirect(`${inventoryPath(authorUserId)}?error=${encodeURIComponent(itemsError.message)}`);
  }

  try {
    if (author) {
      await sendInventoryRequestEmail({
        to: author.email,
        authorName: author.name,
        items: lineItemsForTerms.map((i) => ({ title: i.bookTitle, quantity: i.quantity })),
        totalWholesaleAmount: lineItemsForTerms.reduce((sum, i) => sum + i.wholesaleAmountTotal, 0),
      });
    }
  } catch (err) {
    console.error("Failed to send inventory request email", err);
  }

  redirect(inventoryPath(authorUserId));
}

export async function cancelInventoryRequest(authorUserId: string, requestId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("author_inventory_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId)
    .eq("status", "pending");

  revalidatePath(inventoryPath(authorUserId));
  if (error) {
    redirect(`${inventoryPath(authorUserId)}?error=${encodeURIComponent(error.message)}`);
  }
  redirect(inventoryPath(authorUserId));
}

// The books physically arrived — reuses receive_stock() (migration 0009),
// the same already-tested RPC the catalog screen's own "Restock" action
// calls, once per line item (a multi-book request now has more than one
// to receive), rather than duplicating its atomic increment logic here.
// The author is paid before shipping (see markInventoryRequestPaid), so
// this now requires status = 'paid', not 'accepted'.
export async function markInventoryRequestReceived(authorUserId: string, requestId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { data: request, error: fetchError } = await supabase
    .from("author_inventory_requests")
    .select("status, author_inventory_request_items(catalog_item_id, quantity_requested)")
    .eq("id", requestId)
    .single();

  if (fetchError || !request) {
    redirect(`${inventoryPath(authorUserId)}?error=${encodeURIComponent("Request not found")}`);
  }
  if (request!.status !== "paid") {
    redirect(
      `${inventoryPath(authorUserId)}?error=${encodeURIComponent("Request must be paid first")}`,
    );
  }

  for (const item of request!.author_inventory_request_items) {
    const { error: receiveError } = await supabase.rpc("receive_stock", {
      p_catalog_item_id: item.catalog_item_id,
      p_quantity: item.quantity_requested,
    });
    if (receiveError) {
      redirect(`${inventoryPath(authorUserId)}?error=${encodeURIComponent(receiveError.message)}`);
    }
  }

  const { error: updateError } = await supabase
    .from("author_inventory_requests")
    .update({ status: "received", received_at: new Date().toISOString() })
    .eq("id", requestId);

  revalidatePath(inventoryPath(authorUserId));
  revalidatePath("/admin/catalog");
  if (updateError) {
    redirect(`${inventoryPath(authorUserId)}?error=${encodeURIComponent(updateError.message)}`);
  }
  redirect(inventoryPath(authorUserId));
}

// Payment is manual/offline for now (no real money moves here) — this
// just records that and when the admin paid the author, with an optional
// reference (e.g. "Check #1234") for their own records. The author is
// paid once they've accepted, before the books ship — mark received
// (above) now requires this to have happened first.
export async function markInventoryRequestPaid(
  authorUserId: string,
  requestId: string,
  formData: FormData,
) {
  await requireAdmin();
  const supabase = await createClient();
  const paymentReference = String(formData.get("payment_reference") ?? "").trim() || null;

  const { error } = await supabase
    .from("author_inventory_requests")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_reference: paymentReference,
    })
    .eq("id", requestId)
    .eq("status", "accepted");

  revalidatePath(inventoryPath(authorUserId));
  if (error) {
    redirect(`${inventoryPath(authorUserId)}?error=${encodeURIComponent(error.message)}`);
  }
  redirect(inventoryPath(authorUserId));
}
