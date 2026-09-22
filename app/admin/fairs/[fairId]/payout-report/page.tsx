import { PayoutReportContent } from "./PayoutReportContent";

export default async function AdminPayoutReportPage({
  params,
}: {
  params: Promise<{ fairId: string }>;
}) {
  const { fairId } = await params;
  return <PayoutReportContent fairId={fairId} />;
}
