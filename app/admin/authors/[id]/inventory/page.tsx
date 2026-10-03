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

type InventoryRequest = {
  id: string;
  catalog_item_id: string;
  quantity_requested: number;
  wholesale_cost_per_unit: number;
  wholesale_amount_total: number;
  terms_text: string | null;
  status: string;
  author_note: string | null;
  payment_reference: string | null;
  created_at: string;
  catalog_items: { title: string } | null;
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
  const [{ data: approvedSubmissions }, { data: catalogMatches }, { data: requests }] =
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
          "id, catalog_item_id, quantity_requested, wholesale_cost_per_unit, wholesale_amount_total, terms_text, status, author_note, payment_reference, created_at, catalog_items(title)",
        )
        .eq("author_user_id", authorUserId)
        .order("created_at", { ascending: false }),
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

  const cancelForAuthor = cancelInventoryRequest.bind(null, authorUserId);
  const receivedForAuthor = markInventoryRequestReceived.bind(null, authorUserId);
  const paidForAuthor = markInventoryRequestPaid.bind(null, authorUserId);
  const createForAuthor = createInventoryRequest.bind(null, authorUserId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Inventory requests — ${author.name} 📦`}
        description="Propose a restock of one of this author's existing books, directly to them — quantity, wholesale amount, and whatever terms you want to include."
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
          />
        )}
      </Card>

      <div className="flex flex-col gap-4">
        {(requests ?? []).map((r) => {
          const req = r as unknown as InventoryRequest;
          return (
            <Card key={req.id} className="max-w-lg">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-heading font-bold text-neutral-900">
                    {req.catalog_items?.title ?? "Unknown book"}
                  </h3>
                  <p className="text-sm text-neutral-600">
                    {req.quantity_requested} units — ${req.wholesale_cost_per_unit.toFixed(2)}/unit
                    — ${req.wholesale_amount_total.toFixed(2)} total
                  </p>
                </div>
                <Badge tone={statusTone(req.status)}>{req.status}</Badge>
              </div>
              {req.terms_text && (
                <p className="mt-2 whitespace-pre-line text-sm text-neutral-600">
                  {req.terms_text}
                </p>
              )}
              {req.author_note && (
                <p className="mt-2 text-sm text-neutral-600">
                  Author note: {req.author_note}
                </p>
              )}

              {req.status === "pending" && (
                <form action={cancelForAuthor.bind(null, req.id)} className="mt-3">
                  <Button type="submit" size="sm" variant="outline">
                    Cancel
                  </Button>
                </form>
              )}

              {req.status === "accepted" && (
                <form action={receivedForAuthor.bind(null, req.id)} className="mt-3">
                  <p className="mb-2 text-xs text-neutral-500">
                    Marking received adds {req.quantity_requested} units to this book&apos;s stock
                    on hand.
                  </p>
                  <Button type="submit" size="sm">
                    Mark received
                  </Button>
                </form>
              )}

              {req.status === "received" && (
                <form action={paidForAuthor.bind(null, req.id)} className="mt-3 flex gap-2">
                  <Input
                    name="payment_reference"
                    placeholder="Payment reference (optional)"
                    className="flex-1"
                  />
                  <Button type="submit" size="sm">
                    Mark paid
                  </Button>
                </form>
              )}

              {req.status === "paid" && req.payment_reference && (
                <p className="mt-2 text-xs text-neutral-500">
                  Paid — {req.payment_reference}
                </p>
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
