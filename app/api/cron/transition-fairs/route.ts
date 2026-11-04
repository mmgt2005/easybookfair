import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendReturnDeadlineReminderEmail, sendPendingApplicationsDigestEmail } from "@/lib/email";

// How many days before a fair's return deadline the reminder fires, and
// how many days a review-queue item must sit pending before it counts
// as "stale" for the digest below — both fixed constants for this pass,
// same "a specific chosen number, not configurable" posture already
// used elsewhere in this app (e.g. the wallet assistance pool's $10/$20
// thresholds).
const RETURN_REMINDER_DAYS = 3;
const STALE_PENDING_DAYS = 3;

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

  // Return-deadline reminder — docs/spec.md promised this ("reminder
  // notifications fire before the return deadline") but it was never
  // built. return_deadline <= threshold catches both "within
  // RETURN_REMINDER_DAYS" and "already overdue" in one check, since an
  // overdue deadline is also <= the threshold. return_reminder_sent_at
  // is only stamped on a successful send, so a failure retries the next
  // day this job runs rather than silently never sending.
  const reminderThreshold = new Date();
  reminderThreshold.setDate(reminderThreshold.getDate() + RETURN_REMINDER_DAYS);
  const reminderThresholdIso = reminderThreshold.toISOString().slice(0, 10);

  const { data: fairsNeedingReminder } = await supabase
    .from("fairs")
    .select("id, name, return_deadline, organizations(name, contact_email)")
    .eq("status", "return_window")
    .is("return_reminder_sent_at", null)
    .lte("return_deadline", reminderThresholdIso);

  let remindersSent = 0;
  for (const fair of fairsNeedingReminder ?? []) {
    const org = fair.organizations as unknown as { name: string; contact_email: string | null } | null;
    if (!org?.contact_email) continue;
    try {
      await sendReturnDeadlineReminderEmail({
        to: org.contact_email,
        orgName: org.name,
        fairName: fair.name,
        returnDeadline: fair.return_deadline,
      });
      await supabase
        .from("fairs")
        .update({ return_reminder_sent_at: new Date().toISOString() })
        .eq("id", fair.id);
      remindersSent += 1;
    } catch (emailError) {
      console.error(`Failed to send return-deadline reminder for fair ${fair.id}`, emailError);
    }
  }

  // Stale-pending digest — same count-query shape app/admin/page.tsx's
  // dashboard already runs for its "Pending applications" card, with an
  // added created_at filter. Deliberately re-fires every day something
  // stays stale (no "already sent" flag) — a persistent nag until the
  // admin actually clears the queue is the intended behavior.
  const staleThreshold = new Date();
  staleThreshold.setDate(staleThreshold.getDate() - STALE_PENDING_DAYS);
  const staleThresholdIso = staleThreshold.toISOString();

  const [
    { count: staleFairRequests },
    { count: staleOrgSignups },
    { count: staleAuthorSubmissions },
    { count: staleEventRequests },
    { count: staleBookReviews },
  ] = await Promise.all([
    supabase
      .from("fair_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lt("created_at", staleThresholdIso),
    supabase
      .from("org_signups")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lt("created_at", staleThresholdIso),
    supabase
      .from("author_submissions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lt("created_at", staleThresholdIso),
    supabase
      .from("event_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lt("created_at", staleThresholdIso),
    supabase
      .from("book_reviews")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lt("created_at", staleThresholdIso),
  ]);

  const staleCounts = {
    fairRequests: staleFairRequests ?? 0,
    orgSignups: staleOrgSignups ?? 0,
    authorSubmissions: staleAuthorSubmissions ?? 0,
    eventRequests: staleEventRequests ?? 0,
    bookReviews: staleBookReviews ?? 0,
  };
  const totalStale = Object.values(staleCounts).reduce((sum, n) => sum + n, 0);

  let digestsSent = 0;
  if (totalStale > 0) {
    const { data: admins } = await supabase.from("platform_admins").select("user_id");
    for (const admin of admins ?? []) {
      const { data } = await supabase.auth.admin.getUserById(admin.user_id);
      const email = data.user?.email;
      if (!email) continue;
      try {
        await sendPendingApplicationsDigestEmail({ to: email, counts: staleCounts });
        digestsSent += 1;
      } catch (emailError) {
        console.error(`Failed to send pending-applications digest to admin ${admin.user_id}`, emailError);
      }
    }
  }

  return NextResponse.json({
    activated: activated?.length ?? 0,
    activatedFairs: activated ?? [],
    transitioned: transitioned?.length ?? 0,
    transitionedFairs: transitioned ?? [],
    remindersSent,
    digestsSent,
  });
}
