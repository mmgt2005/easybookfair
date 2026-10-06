import { requireAuthor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { respondToInventoryRequest, setInventoryRequestTrackingNumber } from "../actions";
import { RespondToRequestButtons } from "./RespondToRequestButtons";
import { Badge, Button, Card, Input, PageHeader, statusTone } from "@/components/ui";

export default async function AuthorDashboard({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorMessage } = await searchParams;
  const { name, authorUserId, email } = await requireAuthor();
  const supabase = await createClient();

  const { data: inventoryRequests } = await supabase
    .from("author_inventory_requests")
    .select(
      "id, terms_text, status, admin_note, payment_reference, tracking_number, created_at, author_inventory_request_items(quantity_requested, wholesale_cost_per_unit, wholesale_amount_total, catalog_items(title))",
    )
    .eq("author_user_id", authorUserId)
    .order("created_at", { ascending: false });

  // Explicit author_user_id filter, not just RLS (author_submissions_
  // select already scopes a genuine author's own session via auth.uid())
  // — an admin "viewing as" this author (lib/viewAs.ts) has full RLS
  // visibility via app.is_platform_admin(), so without this filter
  // they'd see every author's submissions mixed together here.
  const { data: submissions } = await supabase
    .from("author_submissions")
    .select(
      "id, title, item_type, suggested_retail_price, wholesale_price, status, admin_note, catalog_item_id, created_at",
    )
    .eq("author_user_id", authorUserId)
    .order("created_at", { ascending: false });

  const catalogItemIds = (submissions ?? [])
    .map((s) => s.catalog_item_id)
    .filter((id): id is string => id !== null);

  // RLS (sales_select_author, migration 0040) already scopes this to only
  // the author's own catalog items — no explicit filter needed beyond the
  // id list itself.
  const { data: sales } =
    catalogItemIds.length > 0
      ? await supabase
          .from("sales")
          .select("catalog_item_id, price_charged")
          .in("catalog_item_id", catalogItemIds)
          .eq("status", "completed")
      : { data: [] };

  const salesByItem = new Map<string, { units: number; revenue: number }>();
  for (const sale of sales ?? []) {
    const entry = salesByItem.get(sale.catalog_item_id) ?? { units: 0, revenue: 0 };
    entry.units += 1;
    entry.revenue += sale.price_charged;
    salesByItem.set(sale.catalog_item_id, entry);
  }

  // Books where this author is only listed via a catalog item's own
  // contact info (migration 0051) — never went through a submission, so
  // they don't show up in the section above. Explicit email filter, not
  // just RLS, for the same admin-"viewing-as" reason noted above.
  const { data: catalogBooks } = email
    ? await supabase
        .from("catalog_items")
        .select("id, title, price, item_type")
        .ilike("author_email", email)
    : { data: [] };

  const catalogBookIds = (catalogBooks ?? []).map((b) => b.id);
  const { data: catalogSales } =
    catalogBookIds.length > 0
      ? await supabase
          .from("sales")
          .select("catalog_item_id, price_charged")
          .in("catalog_item_id", catalogBookIds)
          .eq("status", "completed")
      : { data: [] };

  const catalogSalesByItem = new Map<string, { units: number; revenue: number }>();
  for (const sale of catalogSales ?? []) {
    const entry = catalogSalesByItem.get(sale.catalog_item_id) ?? { units: 0, revenue: 0 };
    entry.units += 1;
    entry.revenue += sale.price_charged;
    catalogSalesByItem.set(sale.catalog_item_id, entry);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Welcome, ${name} 👋`}
        description="Everything you've submitted, its review status, and — once approved — how it's selling."
      />

      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}

      {inventoryRequests && inventoryRequests.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="font-heading text-lg font-bold text-neutral-900">
            Inventory requests
          </h2>
          {inventoryRequests.map((r) => {
            const items = r.author_inventory_request_items as unknown as {
              quantity_requested: number;
              wholesale_cost_per_unit: number;
              wholesale_amount_total: number;
              catalog_items: { title: string } | null;
            }[];
            const total = items.reduce((sum, i) => sum + i.wholesale_amount_total, 0);
            return (
              <Card key={r.id} className="max-w-lg">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-heading font-bold text-neutral-900">
                      {items.length === 1
                        ? (items[0].catalog_items?.title ?? "Unknown book")
                        : `${items.length} books`}
                    </h3>
                    <ul className="mt-1 text-sm text-neutral-600">
                      {items.map((item, i) => (
                        <li key={i}>
                          {item.quantity_requested} x {item.catalog_items?.title ?? "Unknown book"}{" "}
                          @ ${item.wholesale_cost_per_unit.toFixed(2)}/unit = $
                          {item.wholesale_amount_total.toFixed(2)}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-sm font-semibold text-neutral-700">
                      Total: ${total.toFixed(2)}
                    </p>
                  </div>
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                </div>
                {r.terms_text && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold text-neutral-600">
                      Terms
                    </summary>
                    <p className="mt-1 whitespace-pre-line text-sm text-neutral-600">
                      {r.terms_text}
                    </p>
                  </details>
                )}
                {r.status === "pending" && (
                  <RespondToRequestButtons
                    acceptAction={respondToInventoryRequest.bind(null, r.id, true)}
                    declineAction={respondToInventoryRequest.bind(null, r.id, false)}
                  />
                )}
                {(r.status === "accepted" || r.status === "received" || r.status === "paid") && (
                  <form
                    action={setInventoryRequestTrackingNumber.bind(null, r.id)}
                    className="mt-3 flex gap-2"
                  >
                    <Input
                      name="tracking_number"
                      placeholder="Tracking number"
                      defaultValue={r.tracking_number ?? ""}
                      className="flex-1"
                    />
                    <Button type="submit" size="sm" variant="outline">
                      Save
                    </Button>
                  </form>
                )}
                {(r.status === "paid" || r.status === "received") && r.payment_reference && (
                  <p className="mt-2 text-xs text-neutral-500">Paid — {r.payment_reference}</p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {(submissions ?? []).map((s) => {
          const sold = s.catalog_item_id ? salesByItem.get(s.catalog_item_id) : undefined;
          return (
            <Card key={s.id} className="max-w-lg">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-heading font-bold text-neutral-900">{s.title}</h3>
                  <p className="text-sm text-neutral-600">
                    Retail ${s.suggested_retail_price.toFixed(2)} — you earn $
                    {s.wholesale_price.toFixed(2)}/unit
                  </p>
                </div>
                <Badge tone={statusTone(s.status)}>{s.status}</Badge>
              </div>
              {s.status === "declined" && s.admin_note && (
                <p className="mt-2 text-sm text-neutral-600">Reason: {s.admin_note}</p>
              )}
              {s.status === "approved" && (
                <p className="mt-2 text-sm text-neutral-700">
                  {sold
                    ? `${sold.units} sold so far — $${sold.revenue.toFixed(2)} earned`
                    : "On sale — nothing sold yet"}
                </p>
              )}
            </Card>
          );
        })}
        {(submissions ?? []).length === 0 && (
          <p className="text-sm text-neutral-500">
            You haven&apos;t submitted anything yet — use &quot;Submit new item&quot; above.
          </p>
        )}
      </div>

      {catalogBooks && catalogBooks.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="font-heading text-lg font-bold text-neutral-900">
            Books you&apos;re listed as the author for
          </h2>
          {catalogBooks.map((book) => {
            const sold = catalogSalesByItem.get(book.id);
            return (
              <Card key={book.id} className="max-w-lg">
                <h3 className="font-heading font-bold text-neutral-900">{book.title}</h3>
                <p className="text-sm text-neutral-600">Retail ${book.price.toFixed(2)}</p>
                <p className="mt-2 text-sm text-neutral-700">
                  {sold
                    ? `${sold.units} sold so far — $${sold.revenue.toFixed(2)}`
                    : "On sale — nothing sold yet"}
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
