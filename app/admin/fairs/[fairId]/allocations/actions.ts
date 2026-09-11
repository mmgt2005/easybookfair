"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { packCartons, type PackableItem } from "@/lib/packCartons";

function pagePath(fairId: string) {
  return `/admin/fairs/${fairId}/allocations`;
}

function withError(fairId: string, message: string): never {
  redirect(`${pagePath(fairId)}?error=${encodeURIComponent(message)}`);
}

export async function allocate(fairId: string, formData: FormData) {
  const catalogItemId = String(formData.get("catalog_item_id"));
  const quantity = Number(formData.get("quantity"));
  const supabase = await createClient();

  const { error } = await supabase.rpc("allocate_inventory", {
    p_fair_id: fairId,
    p_catalog_item_id: catalogItemId,
    p_quantity: quantity,
  });

  revalidatePath(pagePath(fairId));
  if (error) withError(fairId, error.message);
  redirect(pagePath(fairId));
}

// Reduces an over-allocation and returns the units to stock_on_hand.
// Refuses to pull back units already sold — deallocate_inventory checks
// completed sales for this fair/item and rejects if the requested amount
// exceeds what's actually still unsold (see migration 0012).
export async function deallocate(fairId: string, formData: FormData) {
  const catalogItemId = String(formData.get("catalog_item_id"));
  const quantity = Number(formData.get("quantity"));
  const supabase = await createClient();

  const { error } = await supabase.rpc("deallocate_inventory", {
    p_fair_id: fairId,
    p_catalog_item_id: catalogItemId,
    p_quantity: quantity,
  });

  revalidatePath(pagePath(fairId));
  if (error) withError(fairId, error.message);
  redirect(pagePath(fairId));
}

// "Reorder now": allocates whatever stock is currently available (if any —
// this may be 0), then reserves a restock_orders row against that
// allocation for the remaining shortfall. Only offered in the UI when the
// fair's start date leaves enough lead time (docs/spec.md, "Inventory
// availability at allocation") — otherwise that screen shows a manual
// decision flag instead of this action.
export async function reserveRestock(fairId: string, formData: FormData) {
  const catalogItemId = String(formData.get("catalog_item_id"));
  const shortfall = Number(formData.get("shortfall"));
  const availableNow = Number(formData.get("available_now"));
  const leadTimeDays = Number(formData.get("lead_time_days"));
  const orderedAtInput = String(formData.get("ordered_at") || "");
  const supabase = await createClient();

  if (!Number.isFinite(shortfall) || shortfall <= 0) {
    withError(fairId, "Restock quantity must be positive");
  }

  // ordered_at is the date the order was actually placed with the supplier —
  // may be days before this form is submitted, if you're logging an order
  // placed by phone/email away from a computer. Defaults to today but is
  // backdatable; expected_arrival is computed from it, not from "now".
  const orderedAt = orderedAtInput && !Number.isNaN(Date.parse(orderedAtInput))
    ? new Date(orderedAtInput)
    : new Date();

  let allocationId: string;

  if (availableNow > 0) {
    const { data, error } = await supabase.rpc("allocate_inventory", {
      p_fair_id: fairId,
      p_catalog_item_id: catalogItemId,
      p_quantity: availableNow,
    });
    if (error) withError(fairId, error.message);
    allocationId = data as unknown as string;
  } else {
    const { data: existing } = await supabase
      .from("allocations")
      .select("id")
      .eq("fair_id", fairId)
      .eq("catalog_item_id", catalogItemId)
      .maybeSingle();

    if (existing) {
      allocationId = existing.id;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("allocations")
        .insert({ fair_id: fairId, catalog_item_id: catalogItemId, quantity_allocated: 0 })
        .select("id")
        .single();
      if (insertError) withError(fairId, insertError.message);
      allocationId = inserted!.id;
    }
  }

  const expectedArrival = new Date(orderedAt);
  expectedArrival.setDate(expectedArrival.getDate() + (Number.isFinite(leadTimeDays) ? leadTimeDays : 0));

  const { error: restockError } = await supabase.from("restock_orders").insert({
    catalog_item_id: catalogItemId,
    allocation_id: allocationId,
    quantity: shortfall,
    ordered_at: orderedAt.toISOString().slice(0, 10),
    expected_arrival: expectedArrival.toISOString().slice(0, 10),
  });

  revalidatePath(pagePath(fairId));
  if (restockError) withError(fairId, restockError.message);
  redirect(pagePath(fairId));
}

// Corrects an already-reserved restock order — e.g. the order date entered
// when reserving it was wrong, or the supplier gave a new arrival estimate
// unrelated to the original lead-time math. Both dates are editable
// directly rather than re-derived, since a corrected expected_arrival isn't
// always just ordered_at + lead_time_days (a supplier delay doesn't change
// when the order was placed).
export async function updateRestockOrder(fairId: string, formData: FormData) {
  const restockOrderId = String(formData.get("restock_order_id"));
  const orderedAt = String(formData.get("ordered_at") ?? "");
  const expectedArrival = String(formData.get("expected_arrival") ?? "");
  const quantity = Number(formData.get("quantity"));
  const status = String(formData.get("status") ?? "");
  const supabase = await createClient();

  if (!orderedAt || !expectedArrival || !status) {
    withError(fairId, "Order date, expected arrival, and status are required");
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    withError(fairId, "Quantity must be positive");
  }

  const { error } = await supabase
    .from("restock_orders")
    .update({
      ordered_at: orderedAt,
      expected_arrival: expectedArrival,
      quantity,
      status,
    })
    .eq("id", restockOrderId);

  revalidatePath(pagePath(fairId));
  if (error) withError(fairId, error.message);
  redirect(pagePath(fairId));
}

export async function computePackingSuggestion(fairId: string) {
  const supabase = await createClient();

  const [{ data: allocations, error: allocError }, { data: cartonSpecs, error: cartonError }] =
    await Promise.all([
      supabase
        .from("allocations")
        .select("quantity_allocated, catalog_items(id, title, weight_oz, length_in, width_in, height_in)")
        .eq("fair_id", fairId),
      supabase.from("carton_specs").select("id, name, max_weight_oz, length_in, width_in, height_in"),
    ]);

  if (allocError) withError(fairId, allocError.message);
  if (cartonError) withError(fairId, cartonError.message);

  const packableItems: PackableItem[] = (allocations ?? [])
    .map((row) => {
      const item = row.catalog_items as unknown as {
        id: string;
        title: string;
        weight_oz: number | null;
        length_in: number | null;
        width_in: number | null;
        height_in: number | null;
      } | null;
      if (!item || row.quantity_allocated <= 0) return null;
      const hasDimensions = item.length_in && item.width_in && item.height_in;
      return {
        catalog_item_id: item.id,
        title: item.title,
        weight_oz: item.weight_oz ?? 0,
        volume_in3: hasDimensions ? item.length_in! * item.width_in! * item.height_in! : 0,
        quantity: row.quantity_allocated,
      };
    })
    .filter((x): x is PackableItem => x !== null);

  const totalWeightOz = packableItems.reduce((sum, i) => sum + i.quantity * i.weight_oz, 0);

  if (!cartonSpecs || cartonSpecs.length === 0) {
    withError(fairId, "No carton specs configured");
  }

  // Run the real packing pass per carton option rather than a separate
  // ceil-division estimate, so the "N cartons needed" summary and the
  // actual packing list always agree — a simple weight-or-volume/capacity
  // division can under-count versus what first-fit-decreasing actually
  // produces (e.g. an item too big for a box needs its own carton).
  const optionsWithCartons = cartonSpecs!.map((spec) => {
    const capacity = {
      maxWeightOz: Number(spec.max_weight_oz),
      maxVolumeIn3: Number(spec.length_in) * Number(spec.width_in) * Number(spec.height_in),
    };
    const cartons = packCartons(packableItems, capacity);
    return { carton_spec_id: spec.id, name: spec.name, cartons_needed: cartons.length, cartons };
  });

  const suggested = optionsWithCartons.reduce((best, opt) =>
    opt.cartons_needed < best.cartons_needed ? opt : best,
  );

  const options = optionsWithCartons.map(({ cartons: _cartons, ...rest }) => rest);
  const cartons = suggested.cartons;

  const { error: insertError } = await supabase.from("packing_suggestions").insert({
    fair_id: fairId,
    carton_spec_id: suggested.carton_spec_id,
    suggestion: {
      total_weight_oz: totalWeightOz,
      note: "Weight and volume estimate — items without dimensions fall back to weight only. Not true 3D placement with orientation.",
      options,
      cartons,
    },
  });

  revalidatePath(pagePath(fairId));
  if (insertError) withError(fairId, insertError.message);
  redirect(pagePath(fairId));
}
