import { createClient } from "@/lib/supabase/server";
import { CheckoutClient } from "./CheckoutClient";
import { Card } from "@/components/ui";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ fairId: string }>;
}) {
  const { fairId } = await params;
  const supabase = await createClient();

  const { data: fair } = await supabase
    .from("fairs")
    .select("id, name, stripe_terminal_location_id, organizations(name)")
    .eq("id", fairId)
    .single();

  if (!fair) {
    return <p className="text-sm text-red-600">Fair not found.</p>;
  }

  const { data: allocations } = await supabase
    .from("allocations")
    .select("catalog_item_id, quantity_allocated, catalog_items(id, title, price)")
    .eq("fair_id", fairId)
    .gt("quantity_allocated", 0);

  const catalogItemIds = (allocations ?? []).map((a) => a.catalog_item_id);

  const { data: soldRows } =
    catalogItemIds.length > 0
      ? await supabase
          .from("sales")
          .select("catalog_item_id")
          .eq("fair_id", fairId)
          .eq("status", "completed")
          .in("catalog_item_id", catalogItemIds)
      : { data: [] };

  const soldByItem = new Map<string, number>();
  for (const row of soldRows ?? []) {
    soldByItem.set(row.catalog_item_id, (soldByItem.get(row.catalog_item_id) ?? 0) + 1);
  }

  const items = (allocations ?? [])
    .map((a) => {
      const item = a.catalog_items as unknown as {
        id: string;
        title: string;
        price: number;
      } | null;
      if (!item) return null;
      const sold = soldByItem.get(a.catalog_item_id) ?? 0;
      const available = a.quantity_allocated - sold;
      if (available <= 0) return null;
      return { catalog_item_id: item.id, title: item.title, price: item.price, available };
    })
    .filter(
      (x): x is { catalog_item_id: string; title: string; price: number; available: number } =>
        x !== null,
    )
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-neutral-900">
          {fair.name} — checkout 🛒
        </h1>
        <p className="text-sm text-neutral-600">
          {(fair.organizations as unknown as { name: string } | null)?.name}
        </p>
      </div>

      {!fair.stripe_terminal_location_id && (
        <Card className="max-w-lg border border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            No Terminal reader set up for this fair yet — set one up on the fair&apos;s{" "}
            <a href={`/admin/fairs/${fairId}/edit`} className="font-semibold underline">
              Edit page
            </a>{" "}
            before charging cards here.
          </p>
        </Card>
      )}

      <CheckoutClient
        fairId={fairId}
        items={items}
        terminalLocationId={fair.stripe_terminal_location_id}
      />
    </div>
  );
}
