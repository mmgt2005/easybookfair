"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function parseFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const sheetWidthIn = Number(formData.get("sheet_width_in"));
  const sheetHeightIn = Number(formData.get("sheet_height_in"));
  const labelWidthIn = Number(formData.get("label_width_in"));
  const labelHeightIn = Number(formData.get("label_height_in"));
  const marginTopIn = Number(formData.get("margin_top_in") ?? 0);
  const marginLeftIn = Number(formData.get("margin_left_in") ?? 0);
  const gapXIn = Number(formData.get("gap_x_in") ?? 0);
  const gapYIn = Number(formData.get("gap_y_in") ?? 0);
  const columns = Number(formData.get("columns"));
  const rows = Number(formData.get("rows"));

  if (
    !name ||
    !Number.isFinite(sheetWidthIn) ||
    !Number.isFinite(sheetHeightIn) ||
    !Number.isFinite(labelWidthIn) ||
    !Number.isFinite(labelHeightIn) ||
    !Number.isFinite(marginTopIn) ||
    !Number.isFinite(marginLeftIn) ||
    !Number.isFinite(gapXIn) ||
    !Number.isFinite(gapYIn) ||
    !Number.isFinite(columns) ||
    !Number.isFinite(rows)
  ) {
    throw new Error("Name and all dimensions/grid fields are required");
  }

  return {
    name,
    sheet_width_in: sheetWidthIn,
    sheet_height_in: sheetHeightIn,
    label_width_in: labelWidthIn,
    label_height_in: labelHeightIn,
    margin_top_in: marginTopIn,
    margin_left_in: marginLeftIn,
    gap_x_in: gapXIn,
    gap_y_in: gapYIn,
    columns,
    rows,
  };
}

export async function createLabelTemplate(formData: FormData) {
  const supabase = await createClient();
  const fields = parseFields(formData);

  const { error } = await supabase.from("label_templates").insert(fields);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/label-templates");
}

export async function updateLabelTemplate(labelTemplateId: string, formData: FormData) {
  const supabase = await createClient();
  const fields = parseFields(formData);

  const { error } = await supabase
    .from("label_templates")
    .update(fields)
    .eq("id", labelTemplateId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/label-templates");
  redirect("/admin/label-templates");
}

export async function deleteLabelTemplate(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");

  if (!id) {
    throw new Error("Missing label template id");
  }

  const { error } = await supabase.from("label_templates").delete().eq("id", id);

  if (error) {
    redirect(`/admin/label-templates?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/label-templates");
}
