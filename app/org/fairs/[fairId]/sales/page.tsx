import { requireOrgStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getRecentSales } from "@/app/admin/fairs/[fairId]/sales/actions";
import { SalesFeedClient } from "@/app/admin/fairs/[fairId]/sales/SalesFeedClient";
import { PageHeader } from "@/components/ui";

// Mirrors app/admin/fairs/[fairId]/sales/page.tsx — same getRecentSales
// Server Action and SalesFeedClient (requireFairStaff() inside the action
// lets org staff poll it for a fair their own org owns), only the
// page-level gate and explicit org-ownership check differ.
export default async function OrgSalesFeedPage({
  params,
}: {
  params: Promise<{ fairId: string }>;
}) {
  const { fairId } = await params;
  const { orgIds } = await requireOrgStaff();
  const supabase = await createClient();

  const { data: fair } = await supabase
    .from("fairs")
    .select("id, name")
    .eq("id", fairId)
    .in("org_id", orgIds)
    .maybeSingle();
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
