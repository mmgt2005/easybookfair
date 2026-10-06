import { createClient } from "@/lib/supabase/server";
import {
  cancelInventoryRequest,
  createInventoryRequest,
  markInventoryRequestPaid,
  markInventoryRequestReceived,
} from "../../actions";
import { InventoryRequestForm } from "./InventoryRequestForm";
import { Badge, Button, Card, Input, PageHeader, statusTone } from "@/components/ui";

type EligibleCatalogItem = { id: string; title: string; cost: number; stock_on_hand: number };

type RequestItem = {
  quantity_requested: number;
  wholesale_cost_per_unit: number;
  wholesale_amount_total: number;
  catalog_items: { title: string } | null;
};

type InventoryRequest = {
  id: string;
  terms_text: string | null;
  terms_version: number | null;
  terms_acknowledged: boolean;
  tracking_number: string | null;
  status: string;
  author_note: string | null;
  payment_reference: string | null;
  created_at: string;
  author_inventory_request_items: RequestItem[];
};

export default async function AuthorInventoryRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id: authorUserId } = await params;
  const { error: errorMessage } = await searchParams;
  const supabase = await createClient();

  const { data: author } = await supabase
    .from("authors")
    .select("user_id, name, email")
    .eq("user_id", authorUserId)
    .single();

  if (!author) {
    return <p className="text-sm text-red-600">Author not found.</p>;
  }

  // Same two-source union as author_public_books()/author_public_profile()
  // (migration 0069) — a book reaches this author either through an
  // approved submission or through a catalog item's own author_email
  // contact field. Done as a plain .select() here (not that RPC) since
  // this screen also needs cost/stock_on_hand, which the public RPC
  // deliberately doesn't expose.
  const [{ data: approvedSubmissions }, { data: catalogMatches }, { data: requests }, { data: currentTerms }] =
    await Promise.all([
      supabase
        .from("author_submissions")
        .select("catalog_item_id")
        .eq("author_user_id", authorUserId)
        .eq("status", "approved")
        .not("catalog_item_id", "is", null),
      supabase.from("catalog_items").select("id").ilike("author_email", author.email),
      supabase
        .from("author_inventory_requests")
        .select(
          "id, terms_text, terms_version, terms_acknowledged, tracking_number, status, author_note, payment_reference, created_at, author_inventory_request_items(quantity_requested, wholesale_cost_per_unit, wholesale_amount_total, catalog_items(title))",
        )
        .eq("author_user_id", authorUserId)
        .order("created_at", { ascending: false }),
      supabase
        .from("inventory_terms_versions")
        .select("terms_text")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const eligibleIds = Array.from(
    new Set([
      ...(approvedSubmissions ?? []).map((s) => s.catalog_item_id as string),
      ...(catalogMatches ?? []).map((c) => c.id),
    ]),
  );

  const { data: eligibleItems } =
    eligibleIds.length > 0
      ? await supabase
          .from("catalog_items")
          .select("id, title, cost, stock_on_hand")
          .in("id", eligibleIds)
          .order("title")
      : { data: [] as EligibleCatalogItem[] };

  // Optional convenience link only, not a payment integration — this app
  // has no payment API for paying authors, and neither does most banking
  // software (confirmed for Found specifically: no public developer API).
  const vendorPortalUrl = process.env.VENDOR_PAYMENT_PORTAL_URL;
  const vendorPortalLabel = process.env.VENDOR_PAYMENT_PORTAL_LABEL || "your payment portal";

  const cancelForAuthor = cancelInventoryRequest.bind(null, authorUserId);
  const receivedForAuthor = markInventoryRequestReceived.bind(null, authorUserId);
  const paidForAuthor = markInventoryRequestPaid.bind(null, authorUserId);
  const createForAuthor = createInventoryRequest.bind(null, authorUserId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Inventory requests — ${author.name} 📦`}
        description="Propose a restock of one or more of this author's existing books, directly to them — the standardized terms (editable from Inventory request terms in the nav) are merged in automatically with the real quantities and amounts."
        backHref="/admin/authors"
      />

      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}

      <Card className="max-w-lg">
        <h2 className="font-heading font-bold text-neutral-900">New inventory request</h2>
        {(eligibleItems ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            This author has no approved books in the catalog yet.
          </p>
        ) : (
          <InventoryRequestForm
            action={createForAuthor}
            items={(eligibleItems ?? []) as EligibleCatalogItem[]}
            authorName={author.name}
            termsTemplate={currentTerms?.terms_text ?? ""}
          />
        )}
      </Card>

      <div className="flex flex-col gap-4">
        {(requests ?? []).map((r) => {
          const req = r as unknown as InventoryRequest;
          const total = req.author_inventory_request_items.reduce(
            (sum, i) => sum + i.wholesale_amount_total,
            0,
          );
          return (
            <Card key={req.id} className="max-w-lg">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-heading font-bold text-neutral-900">
                    {req.author_inventory_request_items.length === 1
                      ? (req.author_inventory_request_items[0].catalog_items?.title ?? "Unknown book")
                      : `${req.author_inventory_request_items.length} books`}
                  </h3>
                  <ul className="mt-1 text-sm text-neutral-600">
                    {req.author_inventory_request_items.map((item, i) => (
                      <li key={i}>
                        {item.quantity_requested} x {item.catalog_items?.title ?? "Unknown book"} @ $
                        {item.wholesale_cost_per_unit.toFixed(2)}/unit = $
                        {item.wholesale_amount_total.toFixed(2)}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-sm font-semibold text-neutral-700">
                    Total: ${total.toFixed(2)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge tone={statusTone(req.status)}>{req.status}</Badge>
                  {req.terms_version !== null && (
                    <span className="text-xs text-neutral-400">Terms v{req.terms_version}</span>
                  )}
                </div>
              </div>
              {req.terms_acknowledged && (
                <p className="mt-2 text-xs text-green-700">✅ Terms acknowledged at acceptance</p>
              )}
              {req.terms_text && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-semibold text-neutral-600">
                    Terms sent
                  </summary>
                  <p className="mt-1 whitespace-pre-line text-sm text-neutral-600">
                    {req.terms_text}
                  </p>
                </details>
              )}
              {req.author_note && (
                <p className="mt-2 text-sm text-neutral-600">Author note: {req.author_note}</p>
              )}
              {req.tracking_number && (
                <p className="mt-2 text-sm text-neutral-600">
                  Tracking number: <span className="font-semibold">{req.tracking_number}</span>
                </p>
              )}

              {req.status === "pending" && (
                <form action={cancelForAuthor.bind(null, req.id)} className="mt-3">
                  <Button type="submit" size="sm" variant="outline">
                    Cancel
                  </Button>
                </form>
              )}

              {(req.status === "paid" || req.status === "received") && req.payment_reference && (
                <p className="mt-2 text-xs text-neutral-500">
                  Paid — {req.payment_reference}
                </p>
              )}

              {req.status === "accepted" && (
                <div className="mt-3 flex flex-col gap-2">
                  {vendorPortalUrl && (
                    <a
                      href={vendorPortalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-accent-600 hover:underline"
                    >
                      Pay {author.name} via {vendorPortalLabel} →
                    </a>
                  )}
                  <form action={paidForAuthor.bind(null, req.id)} className="flex gap-2">
                    <Input
                      name="payment_reference"
                      placeholder="Payment reference (optional)"
                      className="flex-1"
                    />
                    <Button type="submit" size="sm">
                      Mark paid
                    </Button>
                  </form>
                </div>
              )}

              {req.status === "paid" && (
                <form action={receivedForAuthor.bind(null, req.id)} className="mt-3">
                  <p className="mb-2 text-xs text-neutral-500">
                    Marking received adds each book&apos;s requested quantity to its stock on hand.
                  </p>
                  <Button type="submit" size="sm">
                    Mark received
                  </Button>
                </form>
              )}
            </Card>
          );
        })}
        {(requests ?? []).length === 0 && (
          <p className="text-sm text-neutral-500">No inventory requests yet.</p>
        )}
      </div>
    </div>
  );
}
