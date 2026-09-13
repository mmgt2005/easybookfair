import { createClient } from "@/lib/supabase/server";
import { closeWalletsForFair } from "./actions";
import { Badge, Button, Card, PageHeader, statusTone } from "@/components/ui";

export default async function WalletsPage({
  params,
  searchParams,
}: {
  params: Promise<{ fairId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { fairId } = await params;
  const { error: errorMessage } = await searchParams;
  const supabase = await createClient();

  const { data: fair } = await supabase.from("fairs").select("id, name").eq("id", fairId).single();
  if (!fair) {
    return <p className="text-sm text-red-600">Fair not found.</p>;
  }

  const { data: wallets } = await supabase
    .from("student_wallets")
    .select("id, student_name, grade, teacher, balance, status")
    .eq("fair_id", fairId)
    .order("student_name");

  const closeWalletsForFairBound = closeWalletsForFair.bind(null, fairId);
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
                <td className="py-2 pr-4">
                  <Badge tone={statusTone(w.status)}>{w.status}</Badge>
                </td>
              </tr>
            ))}
            {(wallets ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 pl-4 text-neutral-500">
                  No wallets yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="max-w-md">
        <h2 className="font-heading font-bold text-neutral-900">Close out wallets</h2>
        <p className="mb-3 text-sm text-neutral-600">
          Sweeps every active wallet&apos;s remaining balance ({activeCount} active) into this
          fair&apos;s org payout and marks them closed — unspent balance becomes additional org
          revenue, not a refund. Do this once the fair&apos;s pickup window has ended; it can&apos;t
          be undone.
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
