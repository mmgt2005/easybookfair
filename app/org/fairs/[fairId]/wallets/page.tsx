import { requireOrgStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { closeWalletsForFair, recordPoolDonation } from "@/app/admin/fairs/[fairId]/wallets/actions";
import { Badge, Button, Card, Input, PageHeader, Textarea, statusTone } from "@/components/ui";

// Mirrors app/admin/fairs/[fairId]/wallets/page.tsx — same
// closeWalletsForFair/recordPoolDonation Server Actions (requireFairStaff()
// inside them lets org staff call them for a fair their own org owns),
// only the page-level gate and explicit org-ownership check differ.
export default async function OrgWalletsPage({
  params,
  searchParams,
}: {
  params: Promise<{ fairId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { fairId } = await params;
  const { error: errorMessage } = await searchParams;
  const { orgIds } = await requireOrgStaff();
  const supabase = await createClient();

  const { data: fair } = await supabase
    .from("fairs")
    .select("id, name")
    .eq("id", fairId)
    .in("org_id", orgIds)
    .maybeSingle();
  if (!fair) {
    return <p className="text-sm text-red-600">Fair not found.</p>;
  }

  const [{ data: wallets }, { data: pool }] = await Promise.all([
    supabase
      .from("student_wallets")
      .select("id, student_name, grade, teacher, balance, status, pool_assistance_used")
      .eq("fair_id", fairId)
      .order("student_name"),
    supabase
      .from("wallet_pools")
      .select(
        "balance, status, students_helped_count, total_assisted, swept_amount, closed_at",
      )
      .eq("fair_id", fairId)
      .maybeSingle(),
  ]);

  const closeWalletsForFairBound = closeWalletsForFair.bind(null, fairId);
  const recordPoolDonationBound = recordPoolDonation.bind(null, fairId);
  const activeCount = (wallets ?? []).filter((w) => w.status === "active").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`${fair.name} — student wallets 💳`} />

      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full max-w-2xl text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
              <th className="py-2 pl-4 pr-4">Student</th>
              <th className="py-2 pr-4">Grade</th>
              <th className="py-2 pr-4">Teacher</th>
              <th className="py-2 pr-4">Balance</th>
              <th className="py-2 pr-4">Pool assist used</th>
              <th className="py-2 pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {(wallets ?? []).map((w) => (
              <tr key={w.id} className="border-b border-neutral-50 last:border-0">
                <td className="py-2 pl-4 pr-4 font-semibold text-neutral-800">{w.student_name}</td>
                <td className="py-2 pr-4 text-neutral-600">{w.grade ?? "—"}</td>
                <td className="py-2 pr-4 text-neutral-600">{w.teacher ?? "—"}</td>
                <td className="py-2 pr-4">${Number(w.balance).toFixed(2)}</td>
                <td className="py-2 pr-4 text-neutral-600">
                  {Number(w.pool_assistance_used) > 0
                    ? `$${Number(w.pool_assistance_used).toFixed(2)}`
                    : "—"}
                </td>
                <td className="py-2 pr-4">
                  <Badge tone={statusTone(w.status)}>{w.status}</Badge>
                </td>
              </tr>
            ))}
            {(wallets ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 pl-4 text-neutral-500">
                  No wallets yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="max-w-md">
        <h2 className="font-heading font-bold text-neutral-900">Wallet assistance pool 🤝</h2>
        {pool?.status === "closed" ? (
          <div className="flex flex-col gap-1 text-sm text-neutral-700">
            <p>
              <span className="font-semibold">Students helped:</span>{" "}
              {pool.students_helped_count}
            </p>
            <p>
              <span className="font-semibold">Total assistance given:</span> $
              {Number(pool.total_assisted ?? 0).toFixed(2)}
            </p>
            <p>
              <span className="font-semibold">Added to the org payout:</span> $
              {Number(pool.swept_amount ?? 0).toFixed(2)}
            </p>
            {pool.closed_at && (
              <p className="text-xs text-neutral-500">
                Closed {new Date(pool.closed_at).toLocaleString()}
              </p>
            )}
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-neutral-600">
              Current balance: <strong>${Number(pool?.balance ?? 0).toFixed(2)}</strong>.
              Automatically covers part of a purchase for a student whose own balance is below
              $10, up to $20 total per student — funded by donors online or recorded here from a
              donation already collected offline.
            </p>
            <form action={recordPoolDonationBound} className="flex flex-col gap-2">
              <Input
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Amount"
                required
              />
              <Textarea name="note" placeholder="Note (optional) — e.g. bake sale proceeds" rows={2} />
              <Button type="submit" size="sm" variant="outline">
                Record a pool donation
              </Button>
            </form>
          </>
        )}
      </Card>

      <Card className="max-w-md">
        <h2 className="font-heading font-bold text-neutral-900">Close out wallets</h2>
        <p className="mb-3 text-sm text-neutral-600">
          Sweeps every active wallet&apos;s remaining balance ({activeCount} active) and any
          unused assistance pool balance into this fair&apos;s org payout and marks them closed —
          unspent balance becomes additional org revenue, not a refund. Do this once the
          fair&apos;s pickup window has ended; it can&apos;t be undone.
        </p>
        <form action={closeWalletsForFairBound}>
          <Button type="submit" variant="outline" disabled={activeCount === 0}>
            Close eWallets for this fair
          </Button>
        </form>
      </Card>
    </div>
  );
}
