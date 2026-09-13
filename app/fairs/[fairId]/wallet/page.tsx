import { createClient } from "@/lib/supabase/server";
import { WalletClient } from "./WalletClient";
import { Card } from "@/components/ui";

type FairPublicInfo = {
  fair_id: string;
  fair_name: string;
  org_name: string;
  is_school: boolean;
  status: string;
  allow_online: boolean;
  allow_wallet: boolean;
  allow_in_person: boolean;
};

export default async function WalletFundingPage({
  params,
  searchParams,
}: {
  params: Promise<{ fairId: string }>;
  searchParams: Promise<{ funded?: string }>;
}) {
  const { fairId } = await params;
  const { funded } = await searchParams;
  const supabase = await createClient();

  const { data: fairInfo } = await supabase
    .rpc("fair_public_info", { p_fair_id: fairId })
    .maybeSingle<FairPublicInfo>();

  if (!fairInfo) {
    return <p className="p-6 text-sm text-red-600">Fair not found.</p>;
  }

  if (!fairInfo.is_school || !fairInfo.allow_wallet) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Card>
          <p className="text-sm text-neutral-700">
            Student wallets aren&apos;t available for {fairInfo.fair_name} —{" "}
            {fairInfo.is_school
              ? "the organization running this fair didn't enable wallets for it."
              : "this feature is only offered for organizations identified as schools."}
          </p>
        </Card>
      </div>
    );
  }

  if (funded) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Card>
          <h1 className="font-heading text-xl font-bold text-neutral-900">Wallet funded 🎉</h1>
          <p className="mt-2 text-sm text-neutral-700">
            Your payment is processing — the balance updates automatically once it clears, and
            carries over if you add more later. Your student can spend it at the checkout table
            during {fairInfo.fair_name} by giving their name (and grade/teacher, if there might be
            another student with the same name).
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-neutral-900">
          Student wallet — {fairInfo.fair_name} 💳
        </h1>
        <p className="text-sm text-neutral-600">{fairInfo.org_name}</p>
      </div>
      <Card>
        <p className="mb-3 text-sm text-neutral-600">
          Load money onto your student&apos;s wallet so they can shop the fair on their own,
          without carrying cash. Any amount left unspent after the fair becomes an additional
          donation toward the school&apos;s payout — it doesn&apos;t roll over or refund.
        </p>
        <WalletClient fairId={fairId} />
      </Card>
    </div>
  );
}
