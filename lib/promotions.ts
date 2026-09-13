// Applies active promotions (migration 0002's `promotions` table — kind
// 'percent' or 'bundle', config in the shapes documented on
// PercentConfig/BundleConfig below) to a cart, computing the actual
// per-line price_charged/promotion_id each checkout path (guest, in-person,
// wallet) then writes into checkout_sessions.line_items / passes to
// record_sale(). Pure and framework-free so it's the same logic — and the
// same test coverage — regardless of which checkout path calls it.
//
// checkout_sessions.line_items and record_sale() both already snapshot one
// price per (catalog_item_id, quantity) line, replicated as `quantity`
// identical-price sales rows — so a promotion that only covers part of a
// line's quantity is represented as a *second* output line for the same
// catalog_item_id at a different price, not a fractional price on one
// line. A promotion never applies twice to the same unit: bundle
// promotions are resolved first (consuming units from the pool), then
// percent promotions run against whatever's left, then anything still
// unclaimed goes out at full price.

export type CatalogPriceInfo = { price: number; cost: number };

export type CartLine = { catalog_item_id: string; quantity: number };

export type PricedLine = {
  catalog_item_id: string;
  quantity: number;
  price_charged: number;
  wholesale_cost: number;
  promotion_id: string | null;
};

// catalog_item_ids null/empty means "every item in the cart is eligible" —
// only meaningful for 'percent'; 'bundle' always requires an explicit,
// non-empty list (a bundle needs a defined pool to draw units from).
export type PercentConfig = {
  percent_off: number;
  min_quantity?: number;
  catalog_item_ids?: string[] | null;
};

export type BundleConfig = {
  catalog_item_ids: string[];
  buy_quantity: number;
  bundle_price: number;
};

export type ActivePromotion =
  | { id: string; kind: "percent"; config: PercentConfig }
  | { id: string; kind: "bundle"; config: BundleConfig };

// starts_at/ends_at are timestamptz, but the admin form only lets you pick
// a date (no time) — the value it submits is stored as midnight at the
// *start* of that calendar day. Comparing full timestamps therefore breaks
// "ends_at": a promotion set to end on the fair's last day would compare
// `ends_at (00:00:00) >= now (any time after midnight)` as false, dropping
// out of the active window for the entire day it was meant to cover
// instead of at the end of it. Comparing calendar-date prefixes instead
// makes an end date inclusive through 23:59:59 of that day, and a start
// date active from 00:00:00 of that day (already correct, kept the same
// way for symmetry).
function toCalendarDate(iso: string): string {
  return iso.slice(0, 10);
}

export function isPromotionInWindow(
  promo: { starts_at: string | null; ends_at: string | null },
  nowIso: string = new Date().toISOString(),
): boolean {
  const today = toCalendarDate(nowIso);
  if (promo.starts_at && toCalendarDate(promo.starts_at) > today) return false;
  if (promo.ends_at && toCalendarDate(promo.ends_at) < today) return false;
  return true;
}

export function applyPromotions(
  cart: CartLine[],
  catalogById: Map<string, CatalogPriceInfo>,
  promotions: ActivePromotion[],
): PricedLine[] {
  const remaining = new Map<string, number>();
  for (const line of cart) {
    remaining.set(
      line.catalog_item_id,
      (remaining.get(line.catalog_item_id) ?? 0) + line.quantity,
    );
  }

  const output: PricedLine[] = [];

  for (const promo of promotions.filter((p) => p.kind === "bundle")) {
    const {
      catalog_item_ids: eligibleIds,
      buy_quantity: buyQuantity,
      bundle_price: bundlePrice,
    } = promo.config;
    if (!eligibleIds?.length || buyQuantity <= 0 || bundlePrice < 0) continue;

    // Richest-item-first, so the buyer gets the best possible deal — the
    // usual convention for "any N of these for $X" bundles.
    const pool = eligibleIds
      .filter((id) => (remaining.get(id) ?? 0) > 0)
      .sort(
        (a, b) =>
          (catalogById.get(b)?.price ?? 0) - (catalogById.get(a)?.price ?? 0),
      );

    const poolTotal = pool.reduce(
      (sum, id) => sum + (remaining.get(id) ?? 0),
      0,
    );
    const numBundles = Math.floor(poolTotal / buyQuantity);
    if (numBundles <= 0) continue;

    let unitsToConsume = numBundles * buyQuantity;
    const perUnitPrice = Math.round((bundlePrice / buyQuantity) * 100) / 100;

    for (const id of pool) {
      if (unitsToConsume <= 0) break;
      const item = catalogById.get(id);
      const avail = remaining.get(id) ?? 0;
      const take = Math.min(avail, unitsToConsume);
      if (take <= 0 || !item) continue;

      output.push({
        catalog_item_id: id,
        quantity: take,
        price_charged: perUnitPrice,
        wholesale_cost: item.cost,
        promotion_id: promo.id,
      });
      remaining.set(id, avail - take);
      unitsToConsume -= take;
    }
  }

  for (const promo of promotions.filter((p) => p.kind === "percent")) {
    const {
      percent_off: percentOff,
      min_quantity: minQuantity = 1,
      catalog_item_ids: configIds,
    } = promo.config;
    if (percentOff <= 0 || percentOff > 100) continue;

    const eligibleIds =
      configIds && configIds.length > 0
        ? configIds
        : Array.from(remaining.keys());
    const poolTotal = eligibleIds.reduce(
      (sum, id) => sum + (remaining.get(id) ?? 0),
      0,
    );
    if (poolTotal < minQuantity) continue;

    for (const id of eligibleIds) {
      const qty = remaining.get(id) ?? 0;
      const item = catalogById.get(id);
      if (qty <= 0 || !item) continue;

      output.push({
        catalog_item_id: id,
        quantity: qty,
        price_charged:
          Math.round(item.price * (1 - percentOff / 100) * 100) / 100,
        wholesale_cost: item.cost,
        promotion_id: promo.id,
      });
      remaining.set(id, 0);
    }
  }

  for (const [id, qty] of remaining) {
    const item = catalogById.get(id);
    if (qty <= 0 || !item) continue;
    output.push({
      catalog_item_id: id,
      quantity: qty,
      price_charged: item.price,
      wholesale_cost: item.cost,
      promotion_id: null,
    });
  }

  return output;
}
