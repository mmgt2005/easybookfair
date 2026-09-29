"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// sales_tax_state_rates (migration 0064) is seeded once with all 50
// states + DC and never needs a row added or removed — every state
// always has exactly one row. Editing is the only operation this screen
// needs: it's the escape hatch for a seeded rate going stale after a
// state changes its statutory sales tax rate via legislation.
export async function updateStateRate(stateCode: string, formData: FormData) {
  const supabase = await createClient();

  const baseRate = Number(formData.get("base_rate"));
  if (!Number.isFinite(baseRate) || baseRate < 0 || baseRate > 1) {
    throw new Error("Base rate must be a number between 0 and 1");
  }

  const { error } = await supabase
    .from("sales_tax_state_rates")
    .update({ base_rate: baseRate })
    .eq("state_code", stateCode);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/sales-tax-rates");
}
