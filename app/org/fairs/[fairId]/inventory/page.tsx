import { requireFairStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui";

// Read-only mirror of three admin allocations-screen pieces (manifest,
// packing suggestion, cash drawer setup) — an org can't edit any of
// these, only see what's been sent and how the admin suggests setting
// up for it. All three are already RLS-readable by org staff
// (allocations_select, packing_suggestions_select, and the new
// cash_drawer_setups_org_select from migration 0058) via
// requireFairStaff()'s membership check, the same authorization
// boundary every other org fair-scoped page uses.
type PackingSuggestion = {
  total_weight_oz: number;
  options: { carton_spec_id: string; name: string; cartons_needed: number }[];
  cartons?: {
    items: { catalog_item_id: string; title: string; quantity: number }[];
    weight_oz: number;
  }[];
};

export default async function OrgInventoryPage({
  params,
}: {
  params: Promise<{ fairId: string }>;
}) {
  const { fairId } = await params;
  await requireFairStaff(fairId);
  const supabase = await createClient();

  const [{ data: fair }, { data: allocations }, { data: latestSuggestion }, { data: cashDrawerSetup }] =
    await Promise.all([
      supabase.from("fairs").select("id, name").eq("id", fairId).maybeSingle(),
      supabase
        .from("allocations")
        .select("catalog_item_id, quantity_allocated, catalog_items(title, price, sku, isbn)")
        .eq("fair_id", fairId),
      supabase
        .from("packing_suggestions")
        .select("carton_spec_id, suggestion")
        .eq("fair_id", fairId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("cash_drawer_setups")
        .select("suggested_float_total, quarters_count, ones_count, fives_count, tens_count")
        .eq("fair_id", fairId)
        .maybeSingle(),
    ]);

  if (!fair) {
    return <p className="text-sm text-red-600">Fair not found.</p>;
  }

  const manifestLines = (allocations ?? [])
    .map((a) => {
      const item = a.catalog_items as unknown as {
        title: string;
        price: number;
        sku: string | null;
        isbn: string | null;
      } | null;
      if (!item || a.quantity_allocated <= 0) return null;
      return { title: item.title, quantity: a.quantity_allocated, price: item.price, sku: item.sku, isbn: item.isbn };
    })
    .filter((x): x is { title: string; quantity: number; price: number; sku: string | null; isbn: string | null } => x !== null);

  const totalUnits = manifestLines.reduce((sum, l) => sum + l.quantity, 0);
  const totalWholesaleValue = manifestLines.reduce((sum, l) => sum + l.quantity * l.price, 0);

  const suggestion = latestSuggestion?.suggestion as PackingSuggestion | undefined;
  const recommendedCarton = suggestion?.options.find(
    (opt) => opt.carton_spec_id === latestSuggestion?.carton_spec_id,
  );

  const denominationTotal = cashDrawerSetup
    ? cashDrawerSetup.quarters_count * 0.25 +
      cashDrawerSetup.ones_count +
      cashDrawerSetup.fives_count * 5 +
      cashDrawerSetup.tens_count * 10
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${fair.name} — fair setup package 📦`}
        description="What's been sent for your fair, plus the admin's suggested packing and starting cash drawer setup."
      />

      <Card className="overflow-x-auto p-0">
        <h2 className="p-4 pb-0 font-heading font-bold text-neutral-900">Inventory manifest</h2>
        <table className="w-full max-w-2xl text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
              <th className="py-2 pl-4 pr-4">Item</th>
              <th className="py-2 pr-4">Qty</th>
              <th className="py-2 pr-4">Price</th>
              <th className="py-2 pr-4">SKU / ISBN</th>
            </tr>
          </thead>
          <tbody>
            {manifestLines.map((line, i) => (
              <tr key={i} className="border-b border-neutral-50 last:border-0">
                <td className="py-2 pl-4 pr-4 font-semibold text-neutral-800">{line.title}</td>
                <td className="py-2 pr-4">{line.quantity}</td>
                <td className="py-2 pr-4">${line.price.toFixed(2)}</td>
                <td className="py-2 pr-4 text-neutral-500">{line.sku ?? line.isbn ?? "—"}</td>
              </tr>
            ))}
            {manifestLines.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 pl-4 text-neutral-500">
                  Nothing allocated to this fair yet.
                </td>
              </tr>
            )}
          </tbody>
          {manifestLines.length > 0 && (
            <tfoot>
              <tr className="border-t border-neutral-100 font-semibold text-neutral-800">
                <td className="py-2 pl-4 pr-4">Total</td>
                <td className="py-2 pr-4">{totalUnits}</td>
                <td className="py-2 pr-4">${totalWholesaleValue.toFixed(2)}</td>
                <td className="py-2 pr-4" />
              </tr>
            </tfoot>
          )}
        </table>
      </Card>

      <Card className="max-w-lg">
        <h2 className="font-heading font-bold text-neutral-900">Packing suggestion 📦</h2>
        <p className="mb-2 text-xs text-neutral-500">
          The admin&apos;s carton recommendation for this shipment — weight-based estimate only.
        </p>
        {suggestion && recommendedCarton ? (
          <div className="flex flex-col gap-3 text-sm">
            <ul>
              <li>Total weight: {suggestion.total_weight_oz} oz</li>
              <li>
                Packed in <strong>{recommendedCarton.name}</strong> cartons —{" "}
                {recommendedCarton.cartons_needed} expected
              </li>
            </ul>
            {suggestion.cartons && suggestion.cartons.length > 0 && (
              <ol className="flex flex-col gap-2">
                {suggestion.cartons.map((carton, i) => (
                  <li key={i} className="rounded-lg bg-neutral-50 p-2">
                    <span className="font-semibold text-neutral-800">
                      Carton {i + 1} ({carton.weight_oz} oz)
                    </span>
                    <ul className="ml-4 list-disc text-neutral-600">
                      {carton.items.map((line) => (
                        <li key={line.catalog_item_id}>
                          {line.quantity}× {line.title}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : (
          <p className="text-sm text-neutral-600">No packing suggestion has been computed yet.</p>
        )}
      </Card>

      <Card className="max-w-lg">
        <h2 className="font-heading font-bold text-neutral-900">Cash drawer setup 💵</h2>
        <p className="mb-2 text-xs text-neutral-500">
          A suggested starting petty-cash float for this fair — not enforced, just a starting
          point for making change.
        </p>
        {cashDrawerSetup ? (
          <div className="flex flex-col gap-2 text-sm">
            <p>
              Target float: <strong>${cashDrawerSetup.suggested_float_total.toFixed(2)}</strong>
            </p>
            <ul className="grid grid-cols-2 gap-1 sm:grid-cols-4">
              <li>Quarters: {cashDrawerSetup.quarters_count}</li>
              <li>$1 bills: {cashDrawerSetup.ones_count}</li>
              <li>$5 bills: {cashDrawerSetup.fives_count}</li>
              <li>$10 bills: {cashDrawerSetup.tens_count}</li>
            </ul>
            <p className="text-xs text-neutral-500">
              Denominations above total ${denominationTotal.toFixed(2)}.
            </p>
          </div>
        ) : (
          <p className="text-sm text-neutral-600">No cash drawer suggestion has been computed yet.</p>
        )}
      </Card>
    </div>
  );
}
