export type PackableItem = {
  catalog_item_id: string;
  title: string;
  weight_oz: number;
  quantity: number;
};

export type CartonAssignment = {
  items: { catalog_item_id: string; title: string; quantity: number }[];
  weight_oz: number;
};

/**
 * First-fit-decreasing bin packing by weight: sorts items heaviest-first,
 * then places each into the first carton with enough remaining capacity,
 * opening a new one when none fits. Same weight-only heuristic as the
 * box-count estimate (no item dimensions exist yet, so this is not true
 * volumetric/dimensional packing) — this just goes one step further and
 * says which items land in which box, not only how many boxes.
 *
 * Items with no weight recorded (weight_oz <= 0) don't consume any
 * carton's capacity, so they're grouped into one carton of their own
 * rather than silently included in the weight-based placement (which
 * would let them ride along "for free" in every box) or dropped
 * entirely (which would leave them off the packing list).
 */
export function packCartons(items: PackableItem[], maxWeightOz: number): CartonAssignment[] {
  const cartons: CartonAssignment[] = [];

  const weighed = items.filter((i) => i.weight_oz > 0 && i.quantity > 0);
  const unweighed = items.filter((i) => !(i.weight_oz > 0) && i.quantity > 0);

  const sorted = [...weighed].sort((a, b) => b.weight_oz - a.weight_oz);

  for (const item of sorted) {
    let remaining = item.quantity;
    while (remaining > 0) {
      let carton = cartons.find((c) => maxWeightOz - c.weight_oz >= item.weight_oz);
      if (!carton) {
        carton = { items: [], weight_oz: 0 };
        cartons.push(carton);
      }
      const roomFor = Math.floor((maxWeightOz - carton.weight_oz) / item.weight_oz);
      // A single item heavier than the whole carton still needs to go
      // somewhere — force at least one unit in rather than looping forever.
      const qty = Math.min(remaining, Math.max(roomFor, 1));

      const existingLine = carton.items.find((li) => li.catalog_item_id === item.catalog_item_id);
      if (existingLine) {
        existingLine.quantity += qty;
      } else {
        carton.items.push({
          catalog_item_id: item.catalog_item_id,
          title: item.title,
          quantity: qty,
        });
      }
      carton.weight_oz += qty * item.weight_oz;
      remaining -= qty;
    }
  }

  if (unweighed.length > 0) {
    cartons.push({
      items: unweighed.map((i) => ({
        catalog_item_id: i.catalog_item_id,
        title: i.title,
        quantity: i.quantity,
      })),
      weight_oz: 0,
    });
  }

  return cartons;
}
