"use client";

import { useEffect, useRef, useState } from "react";
import { getRecentSales, type SaleRow } from "./actions";
import { Card } from "@/components/ui";

const POLL_MS = 4000;
const HIGHLIGHT_MS = 2500;

const CHANNEL_LABELS: Record<string, string> = {
  in_person: "Card (reader)",
  online: "Card (online)",
  wallet: "Wallet",
  cash: "Cash",
};

export function SalesFeedClient({
  fairId,
  initialSales,
  initialTotalUnits,
  initialTotalRevenue,
  initialCashRevenue,
  initialPayout,
  initialPayoutIsFinal,
  initialMissingInventoryCost,
  initialMissingInventoryUnits,
}: {
  fairId: string;
  initialSales: SaleRow[];
  initialTotalUnits: number;
  initialTotalRevenue: number;
  initialCashRevenue: number;
  initialPayout: number;
  initialPayoutIsFinal: boolean;
  initialMissingInventoryCost: number;
  initialMissingInventoryUnits: number;
}) {
  const [sales, setSales] = useState(initialSales);
  const [totalUnits, setTotalUnits] = useState(initialTotalUnits);
  const [totalRevenue, setTotalRevenue] = useState(initialTotalRevenue);
  const [cashRevenue, setCashRevenue] = useState(initialCashRevenue);
  const [payout, setPayout] = useState(initialPayout);
  const [payoutIsFinal, setPayoutIsFinal] = useState(initialPayoutIsFinal);
  const [missingInventoryCost, setMissingInventoryCost] = useState(initialMissingInventoryCost);
  const [missingInventoryUnits, setMissingInventoryUnits] = useState(initialMissingInventoryUnits);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const seenIds = useRef(new Set(initialSales.map((s) => s.id)));

  useEffect(() => {
    let cancelled = false;
    let highlightTimeout: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (document.hidden) return;
      try {
        const result = await getRecentSales(fairId);
        if (cancelled) return;

        const freshIds = new Set<string>();
        for (const sale of result.sales) {
          if (!seenIds.current.has(sale.id)) freshIds.add(sale.id);
        }
        seenIds.current = new Set(result.sales.map((s) => s.id));

        setSales(result.sales);
        setTotalUnits(result.totalUnits);
        setTotalRevenue(result.totalRevenue);
        setCashRevenue(result.cashRevenue);
        setPayout(result.payout);
        setPayoutIsFinal(result.payoutIsFinal);
        setMissingInventoryCost(result.missingInventoryCost);
        setMissingInventoryUnits(result.missingInventoryUnits);

        if (freshIds.size > 0) {
          setNewIds(freshIds);
          if (highlightTimeout) clearTimeout(highlightTimeout);
          highlightTimeout = setTimeout(() => {
            if (!cancelled) setNewIds(new Set());
          }, HIGHLIGHT_MS);
        }
      } catch {
        // Transient poll failure — just try again next tick, no need to
        // surface it (this is a passive feed, not an action the user is
        // waiting on).
      }
    }

    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      if (highlightTimeout) clearTimeout(highlightTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fairId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        <Card className="flex-1">
          <p className="text-xs font-semibold text-neutral-500">Units sold</p>
          <p className="font-heading text-2xl font-bold text-neutral-900">{totalUnits}</p>
        </Card>
        <Card className="flex-1">
          <p className="text-xs font-semibold text-neutral-500">Revenue</p>
          <p className="font-heading text-2xl font-bold text-neutral-900">
            ${totalRevenue.toFixed(2)}
          </p>
        </Card>
        <Card className="flex-1">
          <p className="text-xs font-semibold text-neutral-500">Cash collected</p>
          <p className="font-heading text-2xl font-bold text-neutral-900">
            ${cashRevenue.toFixed(2)}
          </p>
          <p className="mt-0.5 text-xs text-neutral-400">
            {payoutIsFinal
              ? "Already in hand from cash sales — you don't need to receive this separately, only its wholesale cost was netted out of the payout above."
              : "Already in hand from cash sales — not something you're waiting to receive, only its wholesale cost is netted out of the Stripe payout."}
          </p>
        </Card>
        <Card className="flex-1">
          <p className="text-xs font-semibold text-neutral-500">
            {payoutIsFinal ? "Final payout" : "Payout if closed now"}
          </p>
          <p
            className={`font-heading text-2xl font-bold ${
              payout >= 0 ? "text-green-700" : "text-red-700"
            }`}
          >
            {payout >= 0 ? `$${payout.toFixed(2)}` : `Owe $${Math.abs(payout).toFixed(2)}`}
          </p>
          {!payoutIsFinal && (
            <p className="mt-0.5 text-xs text-neutral-400">
              Estimate — updates as sales come in, not locked in until closed
            </p>
          )}
        </Card>
        <Card className="flex-1">
          <p className="text-xs font-semibold text-neutral-500">
            {payoutIsFinal ? "Missing inventory charged" : "If not returned by close"}
          </p>
          <p className="font-heading text-2xl font-bold text-neutral-700">
            ${missingInventoryCost.toFixed(2)}
          </p>
          <p className="mt-0.5 text-xs text-neutral-400">
            {payoutIsFinal
              ? "Already deducted from the payout above."
              : missingInventoryUnits > 0
                ? `${missingInventoryUnits} unit${missingInventoryUnits === 1 ? "" : "s"} not yet sold or returned — only charged if still missing when this fair closes.`
                : "Nothing unaccounted for right now."}
          </p>
        </Card>
      </div>

      <Card className="overflow-x-auto p-0">
        <div className="flex items-center justify-between px-4 py-2">
          <h2 className="font-heading font-bold text-neutral-900">Recent sales</h2>
          <span className="flex items-center gap-1 text-xs text-neutral-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            Live — updates every few seconds
          </span>
        </div>
        <table className="w-full max-w-2xl text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
              <th className="py-2 pl-4 pr-4">Time</th>
              <th className="py-2 pr-4">Item</th>
              <th className="py-2 pr-4">Channel</th>
              <th className="py-2 pr-4">Price</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr
                key={sale.id}
                className={`border-b border-neutral-50 transition-colors last:border-0 ${
                  newIds.has(sale.id) ? "bg-green-50" : ""
                }`}
              >
                <td className="py-2 pl-4 pr-4 text-neutral-600">
                  {new Date(sale.sold_at).toLocaleTimeString()}
                </td>
                <td className="py-2 pr-4 font-semibold text-neutral-800">{sale.title}</td>
                <td className="py-2 pr-4 text-neutral-600">
                  {CHANNEL_LABELS[sale.channel] ?? sale.channel}
                </td>
                <td className="py-2 pr-4 text-neutral-600">${sale.price_charged.toFixed(2)}</td>
              </tr>
            ))}
            {sales.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 pl-4 text-neutral-500">
                  No sales yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
