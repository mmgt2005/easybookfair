import { PayoutReportContent } from "@/app/admin/fairs/[fairId]/payout-report/PayoutReportContent";

// Mirrors app/org/fairs/[fairId]/marketing/page.tsx's pattern of reusing
// the admin folder's shared implementation — requireFairStaff() inside
// PayoutReportContent is the real authorization boundary (a platform
// admin, or org staff whose org owns this specific fair), so no separate
// gate is needed here.
export default async function OrgPayoutReportPage({
  params,
}: {
  params: Promise<{ fairId: string }>;
}) {
  const { fairId } = await params;
  return <PayoutReportContent fairId={fairId} />;
}
