import { createClient } from "@/lib/supabase/server";
import { Card, PrintButton } from "@/components/ui";

type PoolDonationSummary = {
  fair_name: string;
  students_helped_count: number;
  total_assisted: number;
  swept_amount: number;
  closed_at: string;
};

export default async function PoolDonationSummaryPage({
  params,
}: {
  params: Promise<{ fairId: string }>;
}) {
  const { fairId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("pool_donation_summary", { p_fair_id: fairId })
    .maybeSingle<PoolDonationSummary>();

  if (error || !data) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center text-neutral-600">
        <p>This fair&apos;s assistance pool summary isn&apos;t available yet — it&apos;s shown
        once the fair closes.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <Card>
        <h1 className="font-heading text-xl font-bold text-neutral-900">
          Assistance pool impact
        </h1>
        <p className="mt-1 text-sm text-neutral-500">{data.fair_name}</p>

        <div className="mt-4 flex flex-col gap-2 text-sm text-neutral-700">
          <p>
            <span className="font-semibold">Students helped:</span>{" "}
            {data.students_helped_count}
          </p>
          <p>
            <span className="font-semibold">Total assistance given:</span> $
            {Number(data.total_assisted).toFixed(2)}
          </p>
          <p>
            <span className="font-semibold">Added to the school&apos;s payout:</span> $
            {Number(data.swept_amount).toFixed(2)}
          </p>
          <p>
            <span className="font-semibold">Closed:</span>{" "}
            {new Date(data.closed_at).toLocaleDateString()}
          </p>
        </div>

        <p className="mt-4 text-xs text-neutral-500">
          This is a shared, pooled fund — every donor to this fair&apos;s assistance pool sees
          the same fair-wide summary, not a breakdown of any one contribution.
        </p>

        <div className="mt-4 print:hidden">
          <PrintButton />
        </div>
      </Card>
    </main>
  );
}
