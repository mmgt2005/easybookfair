import { createClient } from "@/lib/supabase/server";
import { receiveReturn } from "./actions";
import { CloseFairButton } from "../edit/FairLifecycleButtons";
import { Button, Card, Input, PageHeader } from "@/components/ui";

export default async function FairReturnsPage({
  params,
  searchParams,
}: {
  params: Promise<{ fairId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { fairId } = await params;
  const { error: errorMessage } = await searchParams;
  const supabase = await createClient();

  const [{ data: fair }, { data: allocations }, { data: sales }, { data: settlement }] =
    await Promise.all([
      supabase
        .from("fairs")
        .select("id, name, status, organizations(name)")
        .eq("id", fairId)
        .single(),
      supabase
        .from("allocations")
        .select("id, catalog_item_id, quantity_allocated, quantity_returned, catalog_items(title, cost)")
        .eq("fair_id", fairId),
      supabase
        .from("sales")
        .select("catalog_item_id")
        .eq("fair_id", fairId)
        .eq("status", "completed"),
      supabase
        .from("settlements")
        .select("missing_inventory_cost")
        .eq("fair_id", fairId)
        .maybeSingle(),
    ]);

  if (!fair) {
    return <p className="text-sm text-red-600">Fair not found.</p>;
  }

  const soldByItem = new Map<string, number>();
  for (const sale of sales ?? []) {
    soldByItem.set(sale.catalog_item_id, (soldByItem.get(sale.catalog_item_id) ?? 0) + 1);
  }

  const isClosed = fair.status === "closed";
  const orgName = (fair.organizations as unknown as { name: string } | null)?.name;

  const rows = (allocations ?? []).map((a) => {
    const item = a.catalog_items as unknown as { title: string; cost: number } | null;
    const sold = soldByItem.get(a.catalog_item_id) ?? 0;
    const returnable = Math.max(a.quantity_allocated - a.quantity_returned - sold, 0);
    return {
      allocationId: a.id,
      title: item?.title ?? "Unknown item",
      cost: item?.cost ?? 0,
      allocated: a.quantity_allocated,
      sold,
      returned: a.quantity_returned,
      returnable,
    };
  });

  const liveMissingUnits = rows.reduce((sum, r) => sum + r.returnable, 0);
  const liveMissingCost = rows.reduce((sum, r) => sum + r.returnable * r.cost, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${fair.name} — returns 📦`}
        description={`${orgName ?? ""} · receive physical inventory back before closing this fair.`}
      />

      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full max-w-3xl text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
              <th className="py-2 pl-4 pr-4">Item</th>
              <th className="py-2 pr-4">Allocated</th>
              <th className="py-2 pr-4">Sold</th>
              <th className="py-2 pr-4">Returned</th>
              <th className="py-2 pr-4">Returnable</th>
              {!isClosed && <th className="py-2 pr-4">Receive</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.allocationId} className="border-b border-neutral-50 last:border-0">
                <td className="py-2 pl-4 pr-4 font-semibold text-neutral-800">{r.title}</td>
                <td className="py-2 pr-4 text-neutral-600">{r.allocated}</td>
                <td className="py-2 pr-4 text-neutral-600">{r.sold}</td>
                <td className="py-2 pr-4 text-neutral-600">{r.returned}</td>
                <td className="py-2 pr-4 text-neutral-600">{r.returnable}</td>
                {!isClosed && (
                  <td className="py-2 pr-4">
                    {r.returnable > 0 && (
                      <form
                        action={receiveReturn.bind(null, fairId)}
                        className="flex items-center gap-1"
                      >
                        <input type="hidden" name="allocation_id" value={r.allocationId} />
                        <Input
                          name="quantity"
                          type="number"
                          min={1}
                          max={r.returnable}
                          required
                          className="w-20 px-2 py-1"
                        />
                        <Button type="submit" size="sm">
                          Receive
                        </Button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={isClosed ? 5 : 6} className="py-4 pl-4 text-neutral-500">
                  Nothing allocated to this fair.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="max-w-sm">
        {isClosed ? (
          <p className="text-sm text-neutral-700">
            Fair is closed — the settlement already charged{" "}
            <strong>${(settlement?.missing_inventory_cost ?? 0).toFixed(2)}</strong> for missing
            inventory. These numbers are historical, not editable.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-neutral-700">
              If closed today, estimated missing-inventory charge:{" "}
              <strong>
                {liveMissingUnits} unit{liveMissingUnits === 1 ? "" : "s"} / $
                {liveMissingCost.toFixed(2)}
              </strong>
              . Live estimate, not final until the fair is actually closed.
            </p>
            <div className="border-t border-neutral-100 pt-3">
              <p className="mb-2 text-xs text-neutral-500">
                Receive whatever&apos;s coming back first — closing locks the missing-inventory
                charge using whatever&apos;s still outstanding at that moment.
              </p>
              <CloseFairButton fairId={fairId} />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
