import { MarketingToolkitContent } from "./MarketingToolkitContent";

export default async function AdminMarketingToolkitPage({
  params,
}: {
  params: Promise<{ fairId: string }>;
}) {
  const { fairId } = await params;
  return <MarketingToolkitContent fairId={fairId} />;
}
