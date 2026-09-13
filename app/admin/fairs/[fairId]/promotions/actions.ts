"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { BundleConfig, PercentConfig } from "@/lib/promotions";

function pagePath(fairId: string) {
  return `/admin/fairs/${fairId}/promotions`;
}

export async function createPromotion(fairId: string, formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");
  const active = formData.get("active") === "on";
  const startsAt = String(formData.get("starts_at") ?? "") || null;
  const endsAt = String(formData.get("ends_at") ?? "") || null;
  const catalogItemIds = formData.getAll("catalog_item_ids").map(String).filter(Boolean);

  if (!name || (kind !== "percent" && kind !== "bundle")) {
    throw new Error("Name and a valid kind are required");
  }

  let config: PercentConfig | BundleConfig;
  if (kind === "percent") {
    const percentOff = Number(formData.get("percent_off") ?? 0);
    const minQuantity = Number(formData.get("min_quantity") ?? 1);
    if (!(percentOff > 0 && percentOff <= 100)) {
      throw new Error("Percent off must be between 1 and 100");
    }
    config = {
      percent_off: percentOff,
      min_quantity: minQuantity > 0 ? minQuantity : 1,
      catalog_item_ids: catalogItemIds.length > 0 ? catalogItemIds : null,
    };
  } else {
    const buyQuantity = Number(formData.get("buy_quantity") ?? 0);
    const bundlePrice = Number(formData.get("bundle_price") ?? -1);
    if (catalogItemIds.length === 0) {
      throw new Error("A bundle needs at least one eligible item selected");
    }
    if (!(buyQuantity > 0) || bundlePrice < 0) {
      throw new Error("Buy quantity must be positive and bundle price can't be negative");
    }
    config = { catalog_item_ids: catalogItemIds, buy_quantity: buyQuantity, bundle_price: bundlePrice };
  }

  const { error } = await supabase.from("promotions").insert({
    fair_id: fairId,
    name,
    kind,
    config,
    active,
    starts_at: startsAt,
    ends_at: endsAt,
  });

  if (error) {
    redirect(`${pagePath(fairId)}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(pagePath(fairId));
  redirect(pagePath(fairId));
}

// Same validation as createPromotion — an update instead of an insert.
export async function updatePromotion(fairId: string, promotionId: string, formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");
  const active = formData.get("active") === "on";
  const startsAt = String(formData.get("starts_at") ?? "") || null;
  const endsAt = String(formData.get("ends_at") ?? "") || null;
  const catalogItemIds = formData.getAll("catalog_item_ids").map(String).filter(Boolean);

  if (!name || (kind !== "percent" && kind !== "bundle")) {
    throw new Error("Name and a valid kind are required");
  }

  let config: PercentConfig | BundleConfig;
  if (kind === "percent") {
    const percentOff = Number(formData.get("percent_off") ?? 0);
    const minQuantity = Number(formData.get("min_quantity") ?? 1);
    if (!(percentOff > 0 && percentOff <= 100)) {
      throw new Error("Percent off must be between 1 and 100");
    }
    config = {
      percent_off: percentOff,
      min_quantity: minQuantity > 0 ? minQuantity : 1,
      catalog_item_ids: catalogItemIds.length > 0 ? catalogItemIds : null,
    };
  } else {
    const buyQuantity = Number(formData.get("buy_quantity") ?? 0);
    const bundlePrice = Number(formData.get("bundle_price") ?? -1);
    if (catalogItemIds.length === 0) {
      throw new Error("A bundle needs at least one eligible item selected");
    }
    if (!(buyQuantity > 0) || bundlePrice < 0) {
      throw new Error("Buy quantity must be positive and bundle price can't be negative");
    }
    config = { catalog_item_ids: catalogItemIds, buy_quantity: buyQuantity, bundle_price: bundlePrice };
  }

  const { error } = await supabase
    .from("promotions")
    .update({ name, kind, config, active, starts_at: startsAt, ends_at: endsAt })
    .eq("id", promotionId);

  if (error) {
    redirect(`${pagePath(fairId)}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(pagePath(fairId));
  redirect(pagePath(fairId));
}

export async function togglePromotionActive(fairId: string, promotionId: string, nextActive: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("promotions")
    .update({ active: nextActive })
    .eq("id", promotionId);

  if (error) {
    throw new Error(error.message);
  }
  revalidatePath(pagePath(fairId));
}

export async function deletePromotion(fairId: string, promotionId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("promotions").delete().eq("id", promotionId);

  if (error) {
    throw new Error(error.message);
  }
  revalidatePath(pagePath(fairId));
}
