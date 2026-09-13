import Link from "next/link";
import { requireOrgStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, PageHeader, statusTone } from "@/components/ui";

export default async function OrgDashboard() {
  const { orgIds } = await requireOrgStaff();
  const supabase = await createClient();

  // Explicit org_id filters, not just RLS (fairs_select/
  // fair_requests_org_select already scope a genuine org member's own
  // session via app.current_org_ids()) — an admin "viewing as" this org
  // (lib/viewAs.ts) has full RLS visibility via app.is_platform_admin(),
  // so without these filters they'd see every org's fairs/requests/
  // settlements here instead of just the one they're supposed to be
  // previewing.
  const [{ data: fairs }, { data: requests }, { data: settlements }] = await Promise.all([
    supabase
      .from("fairs")
      .select(
        "id, name, status, start_date, end_date, allow_online, allow_wallet, allow_in_person, allow_cash, organizations(is_school)",
      )
      .in("org_id", orgIds)
      .order("start_date", { ascending: false }),
    supabase
      .from("fair_requests")
      .select(
        "id, requested_name, requested_start_date, requested_end_date, status, admin_note, created_at",
      )
      .in("org_id", orgIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("settlements")
      .select(
        "fair_id, net_payout, transfer_confirmed_at, transfer_reversed_at, payment_link_paid_at",
      )
      .in("org_id", orgIds),
  ]);

  const settlementByFair = new Map((settlements ?? []).map((s) => [s.fair_id, s]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your fairs 🎪"
        description="Fairs your organization is running, and requests awaiting admin approval."
      />

      <Card className="overflow-x-auto p-0">
        <table className="w-full max-w-3xl text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
              <th className="py-2 pl-4 pr-4">Fair</th>
              <th className="py-2 pr-4">Dates</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Payout</th>
              <th className="py-2 pr-4">Run this fair</th>
              <th className="py-2 pr-4">Share with buyers</th>
            </tr>
          </thead>
          <tbody>
            {(fairs ?? []).map((fair) => {
              const org = fair.organizations as unknown as { is_school: boolean } | null;
              const settlement = settlementByFair.get(fair.id);
              const netPayout = settlement?.net_payout;
              return (
                <tr key={fair.id} className="border-b border-neutral-50 last:border-0">
                  <td className="py-2 pl-4 pr-4 font-semibold text-neutral-800">{fair.name}</td>
                  <td className="py-2 pr-4 text-neutral-600">
                    {fair.start_date} – {fair.end_date}
                  </td>
                  <td className="py-2 pr-4">
                    <Badge tone={statusTone(fair.status)}>{fair.status}</Badge>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">
                    {netPayout === undefined ? (
                      "—"
                    ) : (
                      <div className="flex flex-col">
                        {netPayout >= 0 ? (
                          <span className="font-semibold text-green-700">
                            ${netPayout.toFixed(2)}
                          </span>
                        ) : (
                          <span className="font-semibold text-red-700">
                            Owe ${Math.abs(netPayout).toFixed(2)}
                          </span>
                        )}
                        {netPayout > 0 &&
                          (settlement?.transfer_reversed_at ? (
                            <span className="text-xs text-red-700">⚠️ Reversed</span>
                          ) : settlement?.transfer_confirmed_at ? (
                            <span className="text-xs text-neutral-500">✅ Sent</span>
                          ) : null)}
                        {netPayout < 0 &&
                          (settlement?.payment_link_paid_at ? (
                            <span className="text-xs text-neutral-500">✅ Paid</span>
                          ) : (
                            <span className="text-xs text-amber-700">⏳ Awaiting payment</span>
                          ))}
                      </div>
                    )}
                  </td>
                  <td className="flex flex-col gap-1 py-2 pr-4">
                    {(fair.allow_in_person || fair.allow_cash) && (
                      <Link
                        href={`/org/fairs/${fair.id}/checkout`}
                        className="font-semibold text-accent-600 hover:underline"
                      >
                        Checkout →
                      </Link>
                    )}
                    {fair.allow_online && (
                      <Link
                        href={`/org/fairs/${fair.id}/pickup`}
                        className="font-semibold text-accent-600 hover:underline"
                      >
                        Pickup →
                      </Link>
                    )}
                    {fair.allow_wallet && org?.is_school && (
                      <Link
                        href={`/org/fairs/${fair.id}/wallets`}
                        className="font-semibold text-accent-600 hover:underline"
                      >
                        Wallets →
                      </Link>
                    )}
                    <Link
                      href={`/org/fairs/${fair.id}/sales`}
                      className="font-semibold text-accent-600 hover:underline"
                    >
                      Sales feed →
                    </Link>
                    {!fair.allow_in_person &&
                      !fair.allow_cash &&
                      !fair.allow_online &&
                      !(fair.allow_wallet && org?.is_school) && (
                        <span className="text-xs text-neutral-400">No payment options on</span>
                      )}
                  </td>
                  <td className="flex flex-col gap-1 py-2 pr-4">
                    {fair.allow_online && (
                      <Link
                        href={`/fairs/${fair.id}`}
                        target="_blank"
                        className="font-semibold text-accent-600 hover:underline"
                      >
                        Storefront →
                      </Link>
                    )}
                    {fair.allow_wallet && org?.is_school && (
                      <Link
                        href={`/fairs/${fair.id}/wallet`}
                        target="_blank"
                        className="font-semibold text-accent-600 hover:underline"
                      >
                        Student wallet →
                      </Link>
                    )}
                    {!fair.allow_online && !(fair.allow_wallet && org?.is_school) && (
                      <span className="text-xs text-neutral-400">No public links enabled</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {(fairs ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 pl-4 text-neutral-500">
                  No fairs yet — request one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-x-auto p-0">
        <h2 className="p-4 pb-0 font-heading font-bold text-neutral-900">Fair requests</h2>
        <table className="w-full max-w-3xl text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
              <th className="py-2 pl-4 pr-4">Requested name</th>
              <th className="py-2 pr-4">Requested dates</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Admin note</th>
            </tr>
          </thead>
          <tbody>
            {(requests ?? []).map((r) => (
              <tr key={r.id} className="border-b border-neutral-50 last:border-0">
                <td className="py-2 pl-4 pr-4 font-semibold text-neutral-800">
                  {r.requested_name}
                </td>
                <td className="py-2 pr-4 text-neutral-600">
                  {r.requested_start_date} – {r.requested_end_date}
                </td>
                <td className="py-2 pr-4">
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                </td>
                <td className="py-2 pr-4 text-neutral-600">{r.admin_note ?? "—"}</td>
              </tr>
            ))}
            {(requests ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 pl-4 text-neutral-500">
                  No requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
