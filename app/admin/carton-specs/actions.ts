"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createCartonSpec(formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const lengthIn = Number(formData.get("length_in"));
  const widthIn = Number(formData.get("width_in"));
  const heightIn = Number(formData.get("height_in"));
  const maxWeightOz = Number(formData.get("max_weight_oz"));

  if (
    !name ||
    !Number.isFinite(lengthIn) ||
    !Number.isFinite(widthIn) ||
    !Number.isFinite(heightIn) ||
    !Number.isFinite(maxWeightOz)
  ) {
    throw new Error("Name and all dimensions/weight are required");
  }

  const { error } = await supabase.from("carton_specs").insert({
    name,
    length_in: lengthIn,
    width_in: widthIn,
    height_in: heightIn,
    max_weight_oz: maxWeightOz,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/carton-specs");
}

export async function updateCartonSpec(cartonSpecId: string, formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const lengthIn = Number(formData.get("length_in"));
  const widthIn = Number(formData.get("width_in"));
  const heightIn = Number(formData.get("height_in"));
  const maxWeightOz = Number(formData.get("max_weight_oz"));

  if (
    !name ||
    !Number.isFinite(lengthIn) ||
    !Number.isFinite(widthIn) ||
    !Number.isFinite(heightIn) ||
    !Number.isFinite(maxWeightOz)
  ) {
    throw new Error("Name and all dimensions/weight are required");
  }

  const { error } = await supabase
    .from("carton_specs")
    .update({
      name,
      length_in: lengthIn,
      width_in: widthIn,
      height_in: heightIn,
      max_weight_oz: maxWeightOz,
    })
    .eq("id", cartonSpecId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/carton-specs");
  redirect("/admin/carton-specs");
}

// Fails with a foreign-key error (surfaced inline, not a crash) if any
// packing_suggestions row still references this carton spec — deleting it
// out from under an existing suggestion would leave that record pointing
// at nothing, so the database refuses rather than silently orphaning it.
export async function deleteCartonSpec(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");

  if (!id) {
    throw new Error("Missing carton spec id");
  }

  const { error } = await supabase.from("carton_specs").delete().eq("id", id);

  if (error) {
    redirect(`/admin/carton-specs?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/carton-specs");
}
