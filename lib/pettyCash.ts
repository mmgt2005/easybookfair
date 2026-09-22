export const DEFAULT_CASH_SALES_ASSUMPTION_PCT = 0.25;
export const CHANGE_BUFFER_FACTOR = 1.2;

// Max share of the suggested float put toward quarters, reached when every
// allocated dollar of value comes from non-whole-dollar-priced items (e.g.
// $7.99, $12.50) — an all-round-dollar catalog suggests 0 quarters instead.
// Modeling literal per-transaction change-making (e.g. "a $7.99 item paid
// with an $8 bill needs $0.01 back") was tried first and rejected: it
// produces near-zero quarter counts for the exact `.99`-priced catalogs
// docs/spec.md's own example calls out as needing "plenty of quarters,"
// since it only accounts for penny-level change this app doesn't stock
// anyway. Scaling the quarters *share* by how "non-round" the catalog is
// matches that qualitative example without pretending false precision.
const MAX_QUARTER_SHARE = 0.15;

export type AllocatedPriceLine = { price: number; quantity: number };

export type PettyCashSuggestion = {
  expectedCashSalesRevenue: number;
  suggestedFloatTotal: number;
  quartersCount: number;
  onesCount: number;
  fivesCount: number;
  tensCount: number;
};

/**
 * A suggested starting cash-drawer float and its quarters/$1/$5/$10
 * breakdown, from docs/spec.md's "Petty cash suggestion":
 *
 *   expected_cash_sales_revenue = Σ(allocated item price) × cash_sales_assumption_pct
 *   suggested_float_total       = expected_cash_sales_revenue × change_buffer_factor
 *
 * `cashSalesAssumptionPct` is `fairs.cash_sales_assumption_pct` — pass
 * `null` to fall back to `DEFAULT_CASH_SALES_ASSUMPTION_PCT` (the spec's
 * own "e.g. 25%", since there's no org-history auto-refinement built yet).
 * This is a suggestion only, never enforced — every field it returns is
 * meant to be freely overridden afterward.
 */
export function computePettyCashSuggestion(
  lines: AllocatedPriceLine[],
  cashSalesAssumptionPct: number | null,
): PettyCashSuggestion {
  const pct = cashSalesAssumptionPct ?? DEFAULT_CASH_SALES_ASSUMPTION_PCT;
  const totalAllocatedValue = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  const expectedCashSalesRevenue = totalAllocatedValue * pct;
  const suggestedFloatTotal = Math.round(expectedCashSalesRevenue * CHANGE_BUFFER_FACTOR);

  if (suggestedFloatTotal <= 0 || totalAllocatedValue <= 0) {
    return {
      expectedCashSalesRevenue,
      suggestedFloatTotal: Math.max(suggestedFloatTotal, 0),
      quartersCount: 0,
      onesCount: 0,
      fivesCount: 0,
      tensCount: 0,
    };
  }

  const nonRoundValue = lines.reduce((sum, l) => {
    const isWholeDollar = Math.round(l.price * 100) % 100 === 0;
    return sum + (isWholeDollar ? 0 : l.price * l.quantity);
  }, 0);
  const nonRoundFraction = nonRoundValue / totalAllocatedValue;

  const quarterShare = MAX_QUARTER_SHARE * nonRoundFraction;
  const quartersCount = Math.round((suggestedFloatTotal * quarterShare) / 0.25);
  const billsRemaining = Math.max(suggestedFloatTotal - quartersCount * 0.25, 0);

  // Weighted toward $1s since those make change on any tender size.
  const onesCount = Math.round(billsRemaining * 0.5);
  const fivesCount = Math.round((billsRemaining * 0.3) / 5);
  const tensCount = Math.round((billsRemaining * 0.2) / 10);

  return { expectedCashSalesRevenue, suggestedFloatTotal, quartersCount, onesCount, fivesCount, tensCount };
}
