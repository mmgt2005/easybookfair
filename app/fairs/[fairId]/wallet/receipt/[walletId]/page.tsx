import { createClient } from "@/lib/supabase/server";
import { Card, PrintButton } from "@/components/ui";

type WalletDonationReceipt = {
  student_name: string;
  fair_name: string;
  donated_amount: number;
  closed_at: string;
};

export default async function WalletDonationReceiptPage({
  params,
}: {
  params: Promise<{ fairId: string; walletId: string }>;
}) {
  const { walletId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("wallet_donation_receipt", { p_wallet_id: walletId })
    .maybeSingle<WalletDonationReceipt>();

  if (error || !data) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center text-neutral-600">
        <p>Receipt not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <Card>
        <h1 className="font-heading text-xl font-bold text-neutral-900">Donation receipt</h1>
        <p className="mt-1 text-sm text-neutral-500">{data.fair_name}</p>

        <div className="mt-4 flex flex-col gap-2 text-sm text-neutral-700">
          <p>
            <span className="font-semibold">Student:</span> {data.student_name}
          </p>
          <p>
            <span className="font-semibold">Amount donated:</span> $
            {Number(data.donated_amount).toFixed(2)}
          </p>
          <p>
            <span className="font-semibold">Date:</span>{" "}
            {new Date(data.closed_at).toLocaleDateString()}
          </p>
        </div>

        <p className="mt-4 text-xs text-neutral-500">
          This wallet&apos;s unspent balance was not refunded — as shared when it was funded, it
          became an additional donation toward the organization running this fair.
        </p>

        <div className="mt-4 print:hidden">
          <PrintButton />
        </div>
      </Card>
    </main>
  );
}
