export type PackableItem = {
  catalog_item_id: string;
  title: string;
  weight_oz: number; // 0 = no weight recorded
  volume_in3: number; // 0 = no dimensions recorded
  quantity: number;
};

export type CartonCapacity = {
  maxWeightOz: number;
  maxVolumeIn3: number;
};

export type CartonAssignment = {
  items: { catalog_item_id: string; title: string; quantity: number }[];
  weight_oz: number;
  volume_in3: number;
};

/**
 * First-fit-decreasing bin packing against two independent capacities
 * (weight and volume) — a carton is full when either limit is hit, since a
 * real box has both a weight rating and a physical size. An item missing
 * one of the two measurements (e.g. weight recorded but no dimensions yet)
 * is only checked against whichever one it has; an item missing both goes
 * into its own carton(s) at the end rather than being silently unconstrained
 * or dropped from the list. Still a heuristic, not true 3D placement with
 * orientation — this answers "does it fit by size and weight," not "where
 * exactly in the box."
 */
export function packCartons(items: PackableItem[], capacity: CartonCapacity): CartonAssignment[] {
  const cartons: CartonAssignment[] = [];

  const sizedOrWeighed = items.filter(
    (i) => (i.weight_oz > 0 || i.volume_in3 > 0) && i.quantity > 0,
  );
  const unspecified = items.filter(
    (i) => !(i.weight_oz > 0 || i.volume_in3 > 0) && i.quantity > 0,
  );

  // Volume tends to be the more failure-prone constraint for irregularly
  // shaped physical goods, so it's the primary sort key; weight breaks ties.
  const sorted = [...sizedOrWeighed].sort(
    (a, b) => b.volume_in3 - a.volume_in3 || b.weight_oz - a.weight_oz,
  );

  const roomFor = (carton: CartonAssignment, item: PackableItem): number => {
    const remainingWeight = capacity.maxWeightOz - carton.weight_oz;
    const remainingVolume = capacity.maxVolumeIn3 - carton.volume_in3;
    const byWeight = item.weight_oz > 0 ? Math.floor(remainingWeight / item.weight_oz) : Infinity;
    const byVolume = item.volume_in3 > 0 ? Math.floor(remainingVolume / item.volume_in3) : Infinity;
    return Math.min(byWeight, byVolume);
  };

  for (const item of sorted) {
    let remaining = item.quantity;
    while (remaining > 0) {
      let carton = cartons.find((c) => roomFor(c, item) >= 1);
      if (!carton) {
        carton = { items: [], weight_oz: 0, volume_in3: 0 };
        cartons.push(carton);
      }
      // A single item bigger/heavier than the whole carton still needs to
      // go somewhere — force at least one unit in rather than looping
      // forever.
      const qty = Math.min(remaining, Math.max(roomFor(carton, item), 1));

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
      carton.volume_in3 += qty * item.volume_in3;
      remaining -= qty;
    }
  }

  if (unspecified.length > 0) {
    cartons.push({
      items: unspecified.map((i) => ({
        catalog_item_id: i.catalog_item_id,
        title: i.title,
        quantity: i.quantity,
      })),
      weight_oz: 0,
      volume_in3: 0,
    });
  }

  return cartons;
}
