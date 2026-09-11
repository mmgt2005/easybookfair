import { createClient } from "@/lib/supabase/server";
import { allocate, computePackingSuggestion, reserveRestock } from "./actions";
import { Button, Card, Input } from "@/components/ui";

type PackingSuggestion = {
  total_weight_oz: number;
  note: string;
  options: { carton_spec_id: string; name: string; cartons_needed: number }[];
};

export default async function AllocationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ fairId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { fairId } = await params;
  const { error: errorMessage } = await searchParams;
  const supabase = await createClient();

  const { data: fair } = await supabase
    .from("fairs")
    .select("id, name, start_date, organizations(name)")
    .eq("id", fairId)
    .single();

  const [{ data: catalogItems }, { data: allocations }, { data: latestSuggestion }] =
    await Promise.all([
      supabase
        .from("catalog_items")
        .select("id, title, stock_on_hand, lead_time_days")
        .order("title"),
      supabase
        .from("allocations")
        .select("id, catalog_item_id, quantity_allocated")
        .eq("fair_id", fairId),
      supabase
        .from("packing_suggestions")
        .select("carton_spec_id, suggestion, created_at")
        .eq("fair_id", fairId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const allocationByItem = new Map((allocations ?? []).map((a) => [a.catalog_item_id, a]));
  const allocationIds = (allocations ?? []).map((a) => a.id);

  const { data: restockOrders } =
    allocationIds.length > 0
      ? await supabase
          .from("restock_orders")
          .select("catalog_item_id, quantity, status, expected_arrival")
          .in("allocation_id", allocationIds)
      : { data: [] };

  const restockByItem = new Map((restockOrders ?? []).map((r) => [r.catalog_item_id, r]));

  if (!fair) {
    return <p className="text-sm text-red-600">Fair not found.</p>;
  }

  const fairStart = new Date(fair.start_date);
  const today = new Date();
  const daysUntilStart = Math.floor(
    (fairStart.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  const allocateForFair = allocate.bind(null, fairId);
  const reserveRestockForFair = reserveRestock.bind(null, fairId);
  const computeSuggestionForFair = computePackingSuggestion.bind(null, fairId);
  const suggestion = latestSuggestion?.suggestion as PackingSuggestion | undefined;
  const recommendedCarton = suggestion?.options.find(
    (opt) => opt.carton_spec_id === latestSuggestion?.carton_spec_id,
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-neutral-900">
          {fair.name} — allocation 🧮
        </h1>
        <p className="text-sm text-neutral-600">
          {(fair.organizations as unknown as { name: string } | null)?.name} · starts{" "}
          {fair.start_date} ({daysUntilStart} day(s) from today)
        </p>
      </div>

      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full max-w-4xl text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
              <th className="py-2 pl-4 pr-4">Item</th>
              <th className="py-2 pr-4">Available</th>
              <th className="py-2 pr-4">Allocated</th>
              <th className="py-2 pr-4">Allocate more</th>
              <th className="py-2 pr-4">Shortfall handling</th>
            </tr>
          </thead>
          <tbody>
            {catalogItems?.map((item) => {
              const allocated = allocationByItem.get(item.id)?.quantity_allocated ?? 0;
              const leadTimeOk = daysUntilStart >= item.lead_time_days;
              const pendingRestock = restockByItem.get(item.id);

              return (
                <tr key={item.id} className="border-b border-neutral-50 align-top last:border-0">
                  <td className="py-2 pl-4 pr-4 font-semibold text-neutral-800">{item.title}</td>
                  <td className="py-2 pr-4">{item.stock_on_hand}</td>
                  <td className="py-2 pr-4">{allocated}</td>
                  <td className="py-2 pr-4">
                    <form action={allocateForFair} className="flex gap-1">
                      <input type="hidden" name="catalog_item_id" value={item.id} />
                      <Input
                        name="quantity"
                        type="number"
                        min={1}
                        required
                        className="w-20 px-2 py-1"
                      />
                      <Button type="submit" size="sm">
                        Allocate
                      </Button>
                    </form>
                  </td>
                  <td className="py-2 pr-4">
                    {pendingRestock ? (
                      <span className="text-xs text-neutral-600">
                        Restock reserved: {pendingRestock.quantity} ({pendingRestock.status}, due{" "}
                        {pendingRestock.expected_arrival})
                      </span>
                    ) : leadTimeOk ? (
                      <form action={reserveRestockForFair} className="flex items-center gap-1">
                        <input type="hidden" name="catalog_item_id" value={item.id} />
                        <input type="hidden" name="available_now" value={item.stock_on_hand} />
                        <input type="hidden" name="lead_time_days" value={item.lead_time_days} />
                        <span className="text-xs text-neutral-600">Shortfall:</span>
                        <Input
                          name="shortfall"
                          type="number"
                          min={1}
                          required
                          className="w-16 px-2 py-1"
                        />
                        <Button type="submit" size="sm" variant="outline">
                          Reorder now
                        </Button>
                      </form>
                    ) : (
                      <span className="text-xs text-amber-700">
                        Not enough lead time ({item.lead_time_days}d needed) — reduce quantity,
                        substitute, or reschedule.
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card className="max-w-lg">
        <h2 className="font-heading font-bold text-neutral-900">Packing suggestion 📦</h2>
        <p className="mb-2 text-xs text-neutral-500">
          Weight-based estimate only — not true volumetric/dimensional packing.
        </p>
        {suggestion && recommendedCarton ? (
          <ul className="text-sm">
            <li>Total weight: {suggestion.total_weight_oz} oz</li>
            <li>
              Use <strong>{recommendedCarton.name}</strong> cartons —{" "}
              {recommendedCarton.cartons_needed} needed
            </li>
          </ul>
        ) : (
          <p className="text-sm text-neutral-600">No suggestion computed yet.</p>
        )}
        <form action={computeSuggestionForFair} className="mt-2">
          <Button type="submit" size="sm" variant="outline">
            Recompute
          </Button>
        </form>
      </Card>
    </div>
  );
}
