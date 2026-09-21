import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// Runs once a day via Vercel Cron (see vercel.json). Vercel signs cron
// requests with `Authorization: Bearer ${CRON_SECRET}` — verifying it here
// stops anyone else from hitting this route and force-transitioning fairs.
// If CRON_SECRET isn't set, reject outright rather than comparing against
// the literal string "Bearer undefined".
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Service client: this runs with no signed-in user, so RLS's
  // fairs_admin_write policy (which checks app.is_platform_admin()) would
  // otherwise block the update entirely.
  const supabase = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  // Only 'active' fairs — a still-'scheduled' fair whose end date has
  // somehow already passed never got started and isn't this job's problem
  // to fix. Admins can still jump a fair into return_window early with the
  // "Move to return window" button; this just automates the same
  // transition once its end date has passed.
  const { data, error } = await supabase
    .from("fairs")
    .update({ status: "return_window" })
    .eq("status", "active")
    .lt("end_date", today)
    .select("id, name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ transitioned: data?.length ?? 0, fairs: data ?? [] });
}
