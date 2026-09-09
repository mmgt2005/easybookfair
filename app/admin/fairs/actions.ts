"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createFair(formData: FormData) {
  const supabase = await createClient();

  const orgId = String(formData.get("org_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  const returnDeadline = String(formData.get("return_deadline") ?? "");

  if (!orgId || !name || !startDate || !endDate || !returnDeadline) {
    throw new Error("All fields are required");
  }

  const { data, error } = await supabase
    .from("fairs")
    .insert({
      org_id: orgId,
      name,
      start_date: startDate,
      end_date: endDate,
      return_deadline: returnDeadline,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/fairs");
  redirect(`/admin/fairs/${data.id}/allocations`);
}
