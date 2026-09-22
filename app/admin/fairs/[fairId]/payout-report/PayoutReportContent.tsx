import { requireFairStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getRecentSales } from "../sales/actions";
import { Card, PageHeader, PrintButton } from "@/components/ui";

type SettlementDetail = {
  payout_due: number;
  cash_wholesale_owed: number;
  equipment_rental_fee: number;
  closed_at: string;
  stripe_transfer_id: string | null;
  transfer_confirmed_at: string | null;
  transfer_reversed_at: string | null;
  stripe_payment_link_id: string | null;
  payment_link_paid_at: string | null;
};

type ItemizedSale = {
  id: string;
  title: string;
  channel: string;
  price_charged: number;
  sold_at: string;
};

// Shared by both app/admin/fairs/[fairId]/payout-report/page.tsx and
// app/org/fairs/[fairId]/payout-report/page.tsx, same pattern as
// MarketingToolkitContent — requireFairStaff() is the sole authorization
// boundary, so either route can render this directly. Unlike the sales
// feed (SalesFeedClient), which is a live-polled, 30-row-capped view,
// this is a one-shot, fully itemized report meant to be printed/saved
// once, for payout record-keeping — reuses getRecentSales() for the
// aggregate numbers (it already distinguishes live-estimate vs. final
// settlement via payoutIsFinal) but runs its own unlimited itemized-sales
// query instead of relying on that function's capped "recent" list.
export async function PayoutReportContent({ fairId }: { fairId: string }) {
  await requireFairStaff(fairId);
  const supabase = await createClient();

  const [{ data: fair }, aggregate, { data: itemizedRows }] = await Promise.all([
    supabase.from("fairs").select("id, name, start_date, end_date, organizations(name)").eq("id", fairId).maybeSingle(),
    getRecentSales(fairId),
    supabase
      .from("sales")
      .select("id, catalog_item_id, channel, price_charged, sold_at, catalog_items(title)")
      .eq("fair_id", fairId)
      .eq("status", "completed")
      .order("sold_at", { ascending: true }),
  ]);

  if (!fair) {
    return <p className="text-sm text-red-600">Fair not found.</p>;
  }

  const org = fair.organizations as unknown as { name: string } | null;

  const itemizedSales: ItemizedSale[] = (itemizedRows ?? []).map((r) => ({
    id: r.id,
    title: (r.catalog_items as unknown as { title: string } | null)?.title ?? "Unknown item",
    channel: r.channel,
    price_charged: r.price_charged,
    sold_at: r.sold_at,
  }));

  let settlementDetail: SettlementDetail | null = null;
  if (aggregate.payoutIsFinal) {
    const { data } = await supabase
      .from("settlements")
      .select(
        "payout_due, cash_wholesale_owed, equipment_rental_fee, closed_at, stripe_transfer_id, transfer_confirmed_at, transfer_reversed_at, stripe_payment_link_id, payment_link_paid_at",
      )
      .eq("fair_id", fairId)
      .maybeSingle();
    settlementDetail = data;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${fair.name} — payout report 📋`}
        description={`${org?.name ?? ""} · ${fair.start_date} – ${fair.end_date}`}
      />

      <div className="print:hidden">
        <PrintButton />
      </div>

      <Card className="max-w-lg">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {aggregate.payoutIsFinal
            ? "Final settlement"
            : "Live estimate — will finalize when the fair closes"}
        </p>
        <div className="flex flex-col gap-1 text-sm text-neutral-700">
          <p>Units sold: {aggregate.totalUnits}</p>
          <p>Revenue: ${aggregate.totalRevenue.toFixed(2)}</p>
          <p>Cash collected (already in hand): ${aggregate.cashRevenue.toFixed(2)}</p>
          <p>Wallet donations (already in payout): ${aggregate.walletDonations.toFixed(2)}</p>
          {aggregate.poolAssistanceGiven > 0 && (
            <p>
              Pool assistance given (not part of payout): $
              {aggregate.poolAssistanceGiven.toFixed(2)} — helped {aggregate.studentsAssisted}{" "}
              student{aggregate.studentsAssisted === 1 ? "" : "s"}
            </p>
          )}
          {settlementDetail && (
            <>
              <p>Payout due (card/online margin): ${settlementDetail.payout_due.toFixed(2)}</p>
              <p>Cash wholesale owed: ${settlementDetail.cash_wholesale_owed.toFixed(2)}</p>
            </>
          )}
          {aggregate.missingInventoryCost > 0 && (
            <p>Missing inventory cost: ${aggregate.missingInventoryCost.toFixed(2)}</p>
          )}
          {settlementDetail && settlementDetail.equipment_rental_fee > 0 && (
            <p>Equipment rental fee: ${settlementDetail.equipment_rental_fee.toFixed(2)}</p>
          )}
          <p className="mt-1 font-semibold text-neutral-900">
            {aggregate.payout >= 0 ? (
              <span className="text-green-700">Net payout: ${aggregate.payout.toFixed(2)}</span>
            ) : (
              <span className="text-red-700">Org owes: ${Math.abs(aggregate.payout).toFixed(2)}</span>
            )}
          </p>
          {settlementDetail && (
            <>
              <p className="text-xs text-neutral-500">
                Closed {new Date(settlementDetail.closed_at).toLocaleString()}
              </p>
              {aggregate.payout > 0 &&
                (settlementDetail.stripe_transfer_id ? (
                  settlementDetail.transfer_reversed_at ? (
                    <p className="text-red-700">⚠️ Transfer reversed</p>
                  ) : (
                    <p className="text-green-700">✅ Payout sent via Stripe</p>
                  )
                ) : (
                  <p className="text-amber-700">⏳ Payout not sent yet</p>
                ))}
              {aggregate.payout < 0 &&
                (settlementDetail.payment_link_paid_at ? (
                  <p className="text-green-700">✅ Paid</p>
                ) : (
                  <p className="text-amber-700">⏳ Awaiting payment</p>
                ))}
            </>
          )}
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <h2 className="p-4 pb-0 font-heading font-bold text-neutral-900">Itemized sales</h2>
        <table className="w-full max-w-2xl text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
              <th className="py-2 pl-4 pr-4">Date/time</th>
              <th className="py-2 pr-4">Item</th>
              <th className="py-2 pr-4">Channel</th>
              <th className="py-2 pr-4">Price</th>
            </tr>
          </thead>
          <tbody>
            {itemizedSales.map((sale) => (
              <tr key={sale.id} className="border-b border-neutral-50 last:border-0">
                <td className="py-2 pl-4 pr-4 text-neutral-600">
                  {new Date(sale.sold_at).toLocaleString()}
                </td>
                <td className="py-2 pr-4 font-semibold text-neutral-800">{sale.title}</td>
                <td className="py-2 pr-4 text-neutral-600">{sale.channel}</td>
                <td className="py-2 pr-4">${sale.price_charged.toFixed(2)}</td>
              </tr>
            ))}
            {itemizedSales.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 pl-4 text-neutral-500">
                  No sales recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
