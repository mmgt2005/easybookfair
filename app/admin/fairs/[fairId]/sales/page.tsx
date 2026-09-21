import { createClient } from "@/lib/supabase/server";
import { getRecentSales } from "./actions";
import { SalesFeedClient } from "./SalesFeedClient";
import { PageHeader } from "@/components/ui";

export default async function SalesFeedPage({
  params,
}: {
  params: Promise<{ fairId: string }>;
}) {
  const { fairId } = await params;
  const supabase = await createClient();

  const { data: fair } = await supabase.from("fairs").select("id, name").eq("id", fairId).single();
  if (!fair) {
    return <p className="text-sm text-red-600">Fair not found.</p>;
  }

  const initial = await getRecentSales(fairId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${fair.name} — sales feed 📈`}
        description="Every completed sale across all four payment channels, as it happens."
      />
      <SalesFeedClient
        fairId={fairId}
        initialSales={initial.sales}
        initialTotalUnits={initial.totalUnits}
        initialTotalRevenue={initial.totalRevenue}
        initialCashRevenue={initial.cashRevenue}
        initialPayout={initial.payout}
        initialPayoutIsFinal={initial.payoutIsFinal}
        initialMissingInventoryCost={initial.missingInventoryCost}
        initialMissingInventoryUnits={initial.missingInventoryUnits}
      />
    </div>
  );
}
