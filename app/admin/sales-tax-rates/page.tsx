import { createClient } from "@/lib/supabase/server";
import { updateStateRate } from "./actions";
import { Button, Card, Input, PageHeader } from "@/components/ui";

export default async function SalesTaxRatesPage() {
  const supabase = await createClient();
  const { data: rates, error } = await supabase
    .from("sales_tax_state_rates")
    .select("state_code, state_name, base_rate")
    .order("state_name");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sales tax state rates 🧾"
        description="Each US state's base sales tax rate, suggested to org staff when they set a fair's sales tax rate (Edit fair page). These are statutory base rates only — no county/city add-on is modeled here. Correct a row here if a state changes its rate via legislation; no migration needed."
      />

      {error && <p className="text-sm text-red-600">{error.message}</p>}

      <Card className="overflow-x-auto p-0">
        <table className="w-full max-w-xl text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
              <th className="py-2 pl-4 pr-4">State</th>
              <th className="py-2 pr-4">Base rate</th>
              <th className="py-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {rates?.map((rate) => {
              const updateStateRateForState = updateStateRate.bind(null, rate.state_code);
              return (
                <tr key={rate.state_code} className="border-b border-neutral-50 last:border-0">
                  <td className="py-2 pl-4 pr-4 font-semibold text-neutral-800">
                    {rate.state_name}
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">
                    <form action={updateStateRateForState} className="flex items-center gap-2">
                      <Input
                        name="base_rate"
                        type="number"
                        step="0.0001"
                        min={0}
                        max={1}
                        defaultValue={rate.base_rate}
                        className="w-28"
                      />
                      <Button type="submit" size="sm" variant="outline">
                        Save
                      </Button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
