import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, PageHeader, statusTone } from "@/components/ui";

const shortcuts = [
  {
    href: "/admin/catalog",
    emoji: "📖",
    label: "Catalog",
    description: "Add items, bulk upload, restock, edit",
  },
  {
    href: "/admin/organizations",
    emoji: "🏫",
    label: "Organizations",
    description: "Minimal scaffolding to create a test org (real review + Stripe onboarding is Phase 3)",
  },
  {
    href: "/admin/fairs",
    emoji: "🎪",
    label: "Fairs",
    description: "Create a fair, then allocate inventory to it",
  },
  {
    href: "/admin/carton-specs",
    emoji: "📦",
    label: "Carton specs",
    description: "Box sizes used by the packing suggestion",
  },
];

const pendingQueues = [
  { table: "fair_requests", label: "Fair requests", href: "/admin/fair-requests" },
  { table: "org_signups", label: "Org signups", href: "/admin/org-signups" },
  { table: "author_submissions", label: "Author submissions", href: "/admin/author-submissions" },
  { table: "event_requests", label: "Event requests", href: "/admin/event-requests" },
] as const;

type FairRow = {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
  equipment_rental_fee: number;
  organizations: { name: string } | null;
};

export default async function AdminHome() {
  const supabase = await createClient();

  const [
    { data: fairs, error: fairsError },
    { count: fairRequestsPending },
    { count: orgSignupsPending },
    { count: authorSubmissionsPending },
    { count: eventRequestsPending },
  ] = await Promise.all([
    supabase
      .from("fairs")
      .select("id, name, status, start_date, end_date, equipment_rental_fee, organizations(name)")
      .in("status", ["scheduled", "active", "return_window"])
      .order("start_date"),
    supabase.from("fair_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("org_signups").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase
      .from("author_submissions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase.from("event_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  const pendingCounts: Record<(typeof pendingQueues)[number]["table"], number> = {
    fair_requests: fairRequestsPending ?? 0,
    org_signups: orgSignupsPending ?? 0,
    author_submissions: authorSubmissionsPending ?? 0,
    event_requests: eventRequestsPending ?? 0,
  };
  const totalPending = Object.values(pendingCounts).reduce((sum, n) => sum + n, 0);

  const fairRows = (fairs ?? []) as unknown as FairRow[];
  const fairIds = fairRows.map((f) => f.id);

  const unitsByFair = new Map<string, number>();
  const revenueByFair = new Map<string, number>();
  const payoutDueByFair = new Map<string, number>();
  const cashWholesaleOwedByFair = new Map<string, number>();

  if (fairIds.length > 0) {
    const [{ data: sales }, { data: lines }] = await Promise.all([
      supabase
        .from("sales")
        .select("fair_id, price_charged")
        .eq("status", "completed")
        .in("fair_id", fairIds),
      supabase
        .from("journal_lines")
        .select("account_code, debit, credit, journal_entries!inner(fair_id)")
        .in("journal_entries.fair_id", fairIds)
        .in("account_code", ["2000", "1300"]),
    ]);

    for (const sale of sales ?? []) {
      unitsByFair.set(sale.fair_id, (unitsByFair.get(sale.fair_id) ?? 0) + 1);
      revenueByFair.set(sale.fair_id, (revenueByFair.get(sale.fair_id) ?? 0) + sale.price_charged);
    }

    for (const line of lines ?? []) {
      const fairId = (line.journal_entries as unknown as { fair_id: string } | null)?.fair_id;
      if (!fairId) continue;
      if (line.account_code === "2000") {
        payoutDueByFair.set(fairId, (payoutDueByFair.get(fairId) ?? 0) + (line.credit - line.debit));
      } else if (line.account_code === "1300") {
        cashWholesaleOwedByFair.set(
          fairId,
          (cashWholesaleOwedByFair.get(fairId) ?? 0) + (line.debit - line.credit),
        );
      }
    }
  }

  let totalUnits = 0;
  let totalRevenue = 0;

  const rows = fairRows.map((fair) => {
    const units = unitsByFair.get(fair.id) ?? 0;
    const revenue = revenueByFair.get(fair.id) ?? 0;
    totalUnits += units;
    totalRevenue += revenue;

    const payoutDue = Math.max(payoutDueByFair.get(fair.id) ?? 0, 0);
    const cashWholesaleOwed = Math.max(cashWholesaleOwedByFair.get(fair.id) ?? 0, 0);
    const payout = payoutDue - (cashWholesaleOwed + fair.equipment_rental_fee);

    return { fair, units, revenue, payout };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Admin"
        description="Active fairs, revenue/wholesale-owed totals, and pending applications at a glance. Jump into a section below for the rest."
      />

      <Card>
        <h2 className="mb-3 font-heading font-bold text-neutral-900">Pending applications</h2>
        {totalPending === 0 ? (
          <p className="text-sm text-neutral-500">No pending applications.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pendingQueues
              .filter((q) => pendingCounts[q.table] > 0)
              .map((q) => (
                <li key={q.table} className="flex items-center justify-between text-sm">
                  <Link href={q.href} className="font-semibold text-accent-600 hover:underline">
                    {q.label}
                  </Link>
                  <Badge tone="warning">{pendingCounts[q.table]} pending</Badge>
                </li>
              ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-x-auto p-0">
        <h2 className="px-4 pt-4 font-heading font-bold text-neutral-900">Active fairs</h2>
        {fairsError && <p className="px-4 py-2 text-sm text-red-600">{fairsError.message}</p>}
        {fairRows.length === 0 ? (
          <p className="px-4 py-4 text-sm text-neutral-500">No fairs are scheduled, active, or in their return window.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
                <th className="py-2 pl-4 pr-4">Fair</th>
                <th className="py-2 pr-4">Org</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Dates</th>
                <th className="py-2 pr-4">Units</th>
                <th className="py-2 pr-4">Revenue</th>
                <th className="py-2 pr-4">Payout</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ fair, units, revenue, payout }) => (
                <tr key={fair.id} className="border-b border-neutral-50 last:border-0">
                  <td className="py-2 pl-4 pr-4">
                    <Link
                      href={`/admin/fairs/${fair.id}/sales`}
                      className="font-semibold text-accent-600 hover:underline"
                    >
                      {fair.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{fair.organizations?.name}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={statusTone(fair.status)}>{fair.status}</Badge>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">
                    {fair.start_date} – {fair.end_date}
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{units}</td>
                  <td className="py-2 pr-4 text-neutral-600">${revenue.toFixed(2)}</td>
                  <td className="py-2 pr-4">
                    {payout >= 0 ? (
                      <span className="font-semibold text-green-700">${payout.toFixed(2)}</span>
                    ) : (
                      <span className="font-semibold text-red-700">
                        Owe ${Math.abs(payout).toFixed(2)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-neutral-200 bg-neutral-50 font-semibold">
                <td className="py-2 pl-4 pr-4" colSpan={4}>
                  Total
                </td>
                <td className="py-2 pr-4">{totalUnits}</td>
                <td className="py-2 pr-4">${totalRevenue.toFixed(2)}</td>
                <td className="py-2 pr-4" />
              </tr>
            </tfoot>
          </table>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {shortcuts.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="flex h-full flex-col gap-1 transition-shadow hover:shadow-md">
              <span className="text-2xl">{s.emoji}</span>
              <span className="font-heading text-lg font-bold text-neutral-900">{s.label}</span>
              <span className="text-sm text-neutral-600">{s.description}</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
