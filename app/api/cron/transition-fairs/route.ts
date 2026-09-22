import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// Runs once a day via Vercel Cron (see vercel.json) and drives fairs.status
// through its full automatic lifecycle: scheduled -> active on the start
// date, then active -> return_window the morning after the end date. This
// is also what unlocks the public storefront (active only) and wallet
// funding (scheduled + active) once a fair's dates say it should be —
// see fairAllowsStorefront()/fairAllowsWalletFunding() (lib/fairAccess.ts).
// Vercel signs cron requests with `Authorization: Bearer ${CRON_SECRET}` —
// verifying it here stops anyone else from hitting this route and
// force-transitioning fairs. If CRON_SECRET isn't set, reject outright
// rather than comparing against the literal string "Bearer undefined".
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

  // Scheduled -> active once the start date arrives (inclusive — the fair
  // opens *on* that day). Runs before the active -> return_window step
  // below so a fair whose start and end dates are both already in the
  // past (e.g. this automation shipping after some fairs were already
  // sitting stale in 'scheduled') catches all the way up to
  // return_window in one pass, not one status per day. Admins can still
  // set a fair to Active early via the edit page's Status dropdown.
  const { data: activated, error: activateError } = await supabase
    .from("fairs")
    .update({ status: "active" })
    .eq("status", "scheduled")
    .lte("start_date", today)
    .select("id, name");

  if (activateError) {
    return NextResponse.json({ error: activateError.message }, { status: 500 });
  }

  // Active -> return_window once the end date has passed. A still-
  // 'scheduled' fair whose end date has somehow already passed (without
  // ever going active above — e.g. start_date in the future but end_date
  // in the past, a malformed date range) never got started and isn't this
  // job's problem to fix. Admins can still jump a fair into return_window
  // early with the "Move to return window" button.
  const { data: transitioned, error: transitionError } = await supabase
    .from("fairs")
    .update({ status: "return_window" })
    .eq("status", "active")
    .lt("end_date", today)
    .select("id, name");

  if (transitionError) {
    return NextResponse.json({ error: transitionError.message }, { status: 500 });
  }

  return NextResponse.json({
    activated: activated?.length ?? 0,
    activatedFairs: activated ?? [],
    transitioned: transitioned?.length ?? 0,
    transitionedFairs: transitioned ?? [],
  });
}
