import { MarketingToolkitContent } from "@/app/admin/fairs/[fairId]/marketing/MarketingToolkitContent";

// Mirrors app/org/fairs/[fairId]/sales/page.tsx's pattern of reusing the
// admin folder's shared implementation — requireFairStaff() inside
// MarketingToolkitContent is the real authorization boundary (a platform
// admin, or org staff whose org owns this specific fair), so no separate
// gate is needed here.
export default async function OrgMarketingToolkitPage({
  params,
}: {
  params: Promise<{ fairId: string }>;
}) {
  const { fairId } = await params;
  return <MarketingToolkitContent fairId={fairId} />;
}
