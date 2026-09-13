"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function resetDemoFair() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reset_demo_fair");

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/demo");
  revalidatePath("/admin/fairs");
}
