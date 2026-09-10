"use server";

import { revalidatePath } from "next/cache";
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
