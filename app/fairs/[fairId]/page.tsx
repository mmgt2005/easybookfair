import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin, canPreviewFair } from "@/lib/auth";
import { StorefrontClient } from "./StorefrontClient";
import { isPromotionInWindow, type ActivePromotion } from "@/lib/promotions";
import { fairAllowsStorefront, type FairStatus } from "@/lib/fairAccess";

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
  status: FairStatus;
  start_date: string;
  end_date: string;
  allow_online: boolean;
  allow_wallet: boolean;
  allow_in_person: boolean;
  is_demo: boolean;
  is_demo_enabled: boolean;
};

export default async function FairStorefrontPage({
  params,
}: {
  params: Promise<{ fairId: string }>;
}) {
  const { fairId } = await params;
  const supabase = await createClient();

  const [{ data: fairInfo }, { data: items }, { data: promotionRows }] = await Promise.all([
    supabase.rpc("fair_public_info", { p_fair_id: fairId }).maybeSingle<FairPublicInfo>(),
    supabase.rpc("fair_storefront_items", { p_fair_id: fairId }),
    supabase
      .from("promotions")
      .select("id, kind, config, starts_at, ends_at")
      .eq("fair_id", fairId)
      .eq("active", true),
  ]);

  if (!fairInfo) {
    return <p className="p-6 text-sm text-red-600">Fair not found.</p>;
  }

  // Active, in-window promotions for this fair — passed down so the
  // storefront can preview the same discounted total createGuestCheckout()
  // (app/fairs/[fairId]/actions.ts) actually charges, instead of the cart
  // silently pricing from full catalog price the whole time (lib/promotions.ts).
  const activePromotions = (promotionRows ?? []).filter((p) =>
    isPromotionInWindow(p),
  ) as ActivePromotion[];

  // The demo fair's public pages are admin-only (and can be switched off
  // entirely) — real fairs are unaffected, since is_demo is only ever
  // true for the seeded demo organization (migration 0035/0044).
  if (fairInfo.is_demo) {
    if (!fairInfo.is_demo_enabled) {
      return (
        <p className="p-6 text-sm text-neutral-600">
          The demo fair is currently disabled by an admin.
        </p>
      );
    }
    if (!(await isPlatformAdmin())) {
      return (
        <p className="p-6 text-sm text-neutral-600">
          This is a demo fair for admin training only — it isn&apos;t open to the public.
        </p>
      );
    }
  }

  // Online ordering only opens once the fair is actually Active (see
  // lib/fairAccess.ts) — before that, nothing's been set out yet; after,
  // the on-site event is over. A platform admin or this fair's own org
  // staff can still preview the page at any status (canPreviewFair,
  // lib/auth.ts); createGuestCheckout() (./actions.ts) independently
  // re-checks the same Active-only rule with no staff exception, so a
  // preview never actually lets a real order go through.
  const storefrontOpen = fairAllowsStorefront(fairInfo.status);
  const isPreview = !storefrontOpen && (await canPreviewFair(fairId));
  if (!storefrontOpen && !isPreview) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <p className="text-sm text-neutral-600">
          {fairInfo.status === "scheduled"
            ? `${fairInfo.fair_name} hasn't opened yet — online shopping starts ${new Date(
                fairInfo.start_date,
              ).toLocaleDateString()}.`
            : `Online shopping for ${fairInfo.fair_name} has ended.`}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      {isPreview && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          👀 Preview only — this fair isn&apos;t open to the public yet (status: {fairInfo.status}
          ). No order can actually go through until it&apos;s marked Active.
        </p>
      )}
      <div>
        <h1 className="font-heading text-2xl font-bold text-neutral-900">
          {fairInfo.fair_name} 🎪
        </h1>
        <p className="text-sm text-neutral-600">{fairInfo.org_name}</p>
        <p className="mt-1 flex flex-wrap gap-x-4 text-sm">
          {fairInfo.is_school && fairInfo.allow_wallet && (
            <Link
              href={`/fairs/${fairId}/wallet`}
              className="font-semibold text-accent-600 hover:underline"
            >
              Set up or add to a student wallet →
            </Link>
          )}
          {fairInfo.allow_online && (
            <Link
              href={`/fairs/${fairId}/orders`}
              className="font-semibold text-accent-600 hover:underline"
            >
              Find my order →
            </Link>
          )}
        </p>
      </div>
      {fairInfo.allow_online ? (
        <StorefrontClient
          fairId={fairId}
          items={(items as StorefrontItem[]) ?? []}
          promotions={activePromotions}
        />
      ) : (
        <p className="text-sm text-neutral-600">
          Online ordering isn&apos;t available for this fair — check with the organization for
          how to shop in person.
        </p>
      )}
    </div>
  );
}
