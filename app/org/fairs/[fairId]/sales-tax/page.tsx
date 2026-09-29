import { requireOrgStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui";
import { FairSalesTaxForm } from "./FairSalesTaxForm";

// Previously admin-only (/admin/fairs/<id>/edit) — org staff had no
// fair-editing screen at all for this, even though they're the ones who
// actually know their own local tax rate. Uses the same TaxRateFields
// component as the admin edit page, wired to a separate action
// (updateFairSalesTax, app/admin/fairs/actions.ts) that goes through
// set_fair_sales_tax() (migration 0067) instead of the admin page's own
// direct .update() call, since fairs has no org-staff UPDATE policy.
export default async function OrgFairSalesTaxPage({
  params,
}: {
  params: Promise<{ fairId: string }>;
}) {
  const { fairId } = await params;
  const { orgIds } = await requireOrgStaff();
  const supabase = await createClient();

  const { data: fair } = await supabase
    .from("fairs")
    .select("id, name, tax_state, tax_county_pct, tax_city_pct")
    .eq("id", fairId)
    .in("org_id", orgIds)
    .maybeSingle();
  if (!fair) {
    return <p className="text-sm text-red-600">Fair not found.</p>;
  }

  const { data: stateRates } = await supabase
    .from("sales_tax_state_rates")
    .select("state_code, state_name, base_rate")
    .order("state_name");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${fair.name} — sales tax 🧾`}
        description="Optional — applied automatically to every sale channel at checkout (online, in-person, cash, and wallet spends). Never part of your payout; tracked separately as money you're responsible for remitting to your own state."
      />
      <Card className="max-w-sm">
        <FairSalesTaxForm
          fairId={fairId}
          rates={stateRates ?? []}
          initialState={fair.tax_state}
          initialCountyPct={fair.tax_county_pct}
          initialCityPct={fair.tax_city_pct}
        />
      </Card>
    </div>
  );
}
