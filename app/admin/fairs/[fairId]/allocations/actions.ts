"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();

  if (!Number.isFinite(shortfall) || shortfall <= 0) {
    withError(fairId, "Restock quantity must be positive");
  }

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

  const expectedArrival = new Date();
  expectedArrival.setDate(expectedArrival.getDate() + (Number.isFinite(leadTimeDays) ? leadTimeDays : 0));

  const { error: restockError } = await supabase.from("restock_orders").insert({
    catalog_item_id: catalogItemId,
    allocation_id: allocationId,
    quantity: shortfall,
    expected_arrival: expectedArrival.toISOString().slice(0, 10),
  });

  revalidatePath(pagePath(fairId));
  if (restockError) withError(fairId, restockError.message);
  redirect(pagePath(fairId));
}

export async function computePackingSuggestion(fairId: string) {
  const supabase = await createClient();

  const [{ data: allocations, error: allocError }, { data: cartonSpecs, error: cartonError }] =
    await Promise.all([
      supabase
        .from("allocations")
        .select("quantity_allocated, catalog_items(weight_oz)")
        .eq("fair_id", fairId),
      supabase.from("carton_specs").select("id, name, max_weight_oz"),
    ]);

  if (allocError) withError(fairId, allocError.message);
  if (cartonError) withError(fairId, cartonError.message);

  const totalWeightOz = (allocations ?? []).reduce((sum, row) => {
    const item = row.catalog_items as unknown as { weight_oz: number | null } | null;
    return sum + row.quantity_allocated * (item?.weight_oz ?? 0);
  }, 0);

  if (!cartonSpecs || cartonSpecs.length === 0) {
    withError(fairId, "No carton specs configured");
  }

  const options = cartonSpecs!.map((spec) => ({
    carton_spec_id: spec.id,
    name: spec.name,
    cartons_needed:
      totalWeightOz === 0 ? 0 : Math.ceil(totalWeightOz / Number(spec.max_weight_oz)),
  }));

  const suggested = options.reduce((best, opt) =>
    opt.cartons_needed < best.cartons_needed ? opt : best,
  );

  const { error: insertError } = await supabase.from("packing_suggestions").insert({
    fair_id: fairId,
    carton_spec_id: suggested.carton_spec_id,
    suggestion: {
      total_weight_oz: totalWeightOz,
      note: "Weight-based estimate only — not true volumetric/dimensional packing.",
      options,
    },
  });

  revalidatePath(pagePath(fairId));
  if (insertError) withError(fairId, insertError.message);
  redirect(pagePath(fairId));
}
