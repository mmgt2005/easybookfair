import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StorefrontClient } from "./StorefrontClient";

type StorefrontItem = {
  catalog_item_id: string;
  title: string;
  price: number;
  image_url: string | null;
  description: string | null;
  category: string | null;
  available: number;
};

type FairPublicInfo = {
  fair_id: string;
  fair_name: string;
  org_name: string;
  is_school: boolean;
  status: string;
};

export default async function FairStorefrontPage({
  params,
}: {
  params: Promise<{ fairId: string }>;
}) {
  const { fairId } = await params;
  const supabase = await createClient();

  const [{ data: fairInfo }, { data: items }] = await Promise.all([
    supabase.rpc("fair_public_info", { p_fair_id: fairId }).maybeSingle<FairPublicInfo>(),
    supabase.rpc("fair_storefront_items", { p_fair_id: fairId }),
  ]);

  if (!fairInfo) {
    return <p className="p-6 text-sm text-red-600">Fair not found.</p>;
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-neutral-900">
          {fairInfo.fair_name} 🎪
        </h1>
        <p className="text-sm text-neutral-600">{fairInfo.org_name}</p>
        <p className="mt-1 flex flex-wrap gap-x-4 text-sm">
          {fairInfo.is_school && (
            <Link
              href={`/fairs/${fairId}/wallet`}
              className="font-semibold text-accent-600 hover:underline"
            >
              Set up or add to a student wallet →
            </Link>
          )}
          <Link
            href={`/fairs/${fairId}/orders`}
            className="font-semibold text-accent-600 hover:underline"
          >
            Find my order →
          </Link>
        </p>
      </div>
      <StorefrontClient fairId={fairId} items={(items as StorefrontItem[]) ?? []} />
    </div>
  );
}
