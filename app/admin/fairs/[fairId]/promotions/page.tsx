import { createClient } from "@/lib/supabase/server";
import { createPromotion, togglePromotionActive, deletePromotion } from "./actions";
import { PromotionForm } from "./PromotionForm";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import type { BundleConfig, PercentConfig } from "@/lib/promotions";

export default async function PromotionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ fairId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { fairId } = await params;
  const { error: errorMessage } = await searchParams;
  const supabase = await createClient();

  const { data: fair } = await supabase.from("fairs").select("id, name").eq("id", fairId).single();
  if (!fair) {
    return <p className="text-sm text-red-600">Fair not found.</p>;
  }

  const [{ data: promotions }, { data: allocations }] = await Promise.all([
    supabase
      .from("promotions")
      .select("id, name, kind, config, active, starts_at, ends_at")
      .eq("fair_id", fairId)
      .order("name"),
    supabase
      .from("allocations")
      .select("catalog_item_id, catalog_items(id, title)")
      .eq("fair_id", fairId),
  ]);

  const items = (allocations ?? [])
    .map((a) => a.catalog_items as unknown as { id: string; title: string } | null)
    .filter((item): item is { id: string; title: string } => item !== null);

  const itemTitleById = new Map(items.map((i) => [i.id, i.title]));
  const createPromotionForFair = createPromotion.bind(null, fairId);

  function describeConfig(kind: string, config: PercentConfig | BundleConfig) {
    if (kind === "percent") {
      const c = config as PercentConfig;
      const items = c.catalog_item_ids?.length
        ? c.catalog_item_ids.map((id) => itemTitleById.get(id) ?? id).join(", ")
        : "every item";
      return `${c.percent_off}% off ${items}${c.min_quantity && c.min_quantity > 1 ? ` (buy ${c.min_quantity}+)` : ""}`;
    }
    const c = config as BundleConfig;
    const items = c.catalog_item_ids.map((id) => itemTitleById.get(id) ?? id).join(", ");
    return `Any ${c.buy_quantity} of ${items} for $${c.bundle_price.toFixed(2)}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${fair.name} — promotions 🏷️`}
        description="Bundle deals and percent-off discounts, applied automatically at checkout (online, in-person, and wallet) — buyers don't choose them."
      />

      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}

      <div className="flex flex-col gap-4">
        {(promotions ?? []).map((promo) => {
          const toggleForPromo = togglePromotionActive.bind(null, fairId, promo.id, !promo.active);
          const deleteForPromo = deletePromotion.bind(null, fairId, promo.id);
          return (
            <Card key={promo.id} className="max-w-lg">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-heading font-bold text-neutral-900">{promo.name}</h3>
                  <p className="text-sm text-neutral-600">
                    {describeConfig(promo.kind, promo.config)}
                  </p>
                  {(promo.starts_at || promo.ends_at) && (
                    <p className="text-xs text-neutral-500">
                      {promo.starts_at ?? "no start"} – {promo.ends_at ?? "no end"}
                    </p>
                  )}
                </div>
                <Badge tone={promo.active ? "success" : "neutral"}>
                  {promo.active ? "active" : "inactive"}
                </Badge>
              </div>
              <div className="mt-3 flex gap-2">
                <form action={toggleForPromo}>
                  <Button type="submit" size="sm" variant="outline">
                    {promo.active ? "Deactivate" : "Activate"}
                  </Button>
                </form>
                <form action={deleteForPromo}>
                  <Button type="submit" size="sm" variant="ghost">
                    Delete
                  </Button>
                </form>
              </div>
            </Card>
          );
        })}
        {(promotions ?? []).length === 0 && (
          <p className="text-sm text-neutral-500">No promotions yet for this fair.</p>
        )}
      </div>

      <PromotionForm items={items} action={createPromotionForFair} />
    </div>
  );
}
