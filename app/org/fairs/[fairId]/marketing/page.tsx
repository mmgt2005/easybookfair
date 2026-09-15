import { requireOrgStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/email";
import { qrCodeDataUrl } from "@/lib/qr";
import { buildSocialPost, buildParentEmailBlurb, buildFlyerTagline } from "@/lib/marketingCopy";
import { Card, CopyButton, PageHeader, PrintButton } from "@/components/ui";

// Same page-level gate as app/org/fairs/[fairId]/sales/page.tsx — an
// explicit org-ownership check via .in("org_id", orgIds), not just RLS,
// since an admin "viewing as" this org would otherwise see any fair.
export default async function OrgMarketingToolkitPage({
  params,
}: {
  params: Promise<{ fairId: string }>;
}) {
  const { fairId } = await params;
  const { orgIds } = await requireOrgStaff();
  const supabase = await createClient();

  const { data: fair } = await supabase
    .from("fairs")
    .select("id, name, start_date, end_date, allow_online, allow_wallet, organizations(is_school)")
    .eq("id", fairId)
    .in("org_id", orgIds)
    .maybeSingle();
  if (!fair) {
    return <p className="text-sm text-red-600">Fair not found.</p>;
  }

  const org = fair.organizations as unknown as { is_school: boolean } | null;
  const showWallet = fair.allow_wallet && org?.is_school;

  const storefrontUrl = `${siteUrl()}/fairs/${fair.id}`;
  const walletUrl = showWallet ? `${siteUrl()}/fairs/${fair.id}/wallet` : null;

  if (!fair.allow_online && !showWallet) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={`${fair.name} — marketing toolkit 📣`}
          description="Links, QR codes, a flyer, and ready-to-copy text to help spread the word."
        />
        <p className="text-sm text-neutral-500">
          This fair has no public online links enabled yet — turn on the storefront or student
          wallet to get shareable links here.
        </p>
      </div>
    );
  }

  const [storefrontQr, walletQr, { data: allocatedItems }] = await Promise.all([
    fair.allow_online ? qrCodeDataUrl(storefrontUrl) : Promise.resolve(null),
    walletUrl ? qrCodeDataUrl(walletUrl) : Promise.resolve(null),
    supabase
      .from("allocations")
      .select("catalog_items(title, image_url)")
      .eq("fair_id", fair.id),
  ]);

  // Only items with a cover image actually add anything visual to the
  // flyer — cap at 8 so a fair with a big catalog doesn't blow out the
  // one-page layout.
  const coverBooks = (allocatedItems ?? [])
    .map((a) => a.catalog_items as unknown as { title: string; image_url: string | null } | null)
    .filter((item): item is { title: string; image_url: string } => !!item?.image_url)
    .slice(0, 8);

  const copyParams = {
    fairName: fair.name,
    startDate: fair.start_date,
    endDate: fair.end_date,
    storefrontUrl,
    walletUrl,
  };
  const socialPost = buildSocialPost(copyParams);
  const parentBlurb = buildParentEmailBlurb(copyParams);
  const flyerTagline = buildFlyerTagline(fair.name);

  return (
    <div className="flex flex-col gap-6 print:gap-0">
      <div className="print:hidden">
        <PageHeader
          title={`${fair.name} — marketing toolkit 📣`}
          description="Links, QR codes, a flyer, and ready-to-copy text to help spread the word."
        />
      </div>

      <div className="flex flex-col gap-6 print:hidden">
        <Card className="flex flex-col gap-3">
          <h2 className="font-heading font-bold text-neutral-900">Links</h2>
          {fair.allow_online && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-neutral-600">{storefrontUrl}</span>
              <CopyButton text={storefrontUrl} label="Copy storefront link" />
            </div>
          )}
          {walletUrl && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-neutral-600">{walletUrl}</span>
              <CopyButton text={walletUrl} label="Copy wallet link" />
            </div>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="font-heading font-bold text-neutral-900">QR codes</h2>
          <div className="flex flex-wrap gap-6">
            {storefrontQr && (
              <div className="flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={storefrontQr} alt="Storefront QR code" className="h-32 w-32" />
                <span className="text-xs text-neutral-500">Storefront</span>
              </div>
            )}
            {walletQr && (
              <div className="flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={walletQr} alt="Student wallet QR code" className="h-32 w-32" />
                <span className="text-xs text-neutral-500">Student wallet</span>
              </div>
            )}
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="font-heading font-bold text-neutral-900">Ready-to-copy text</h2>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-neutral-600">Social media post</p>
            <textarea
              readOnly
              rows={3}
              value={socialPost}
              className="rounded-lg border border-neutral-200 p-2 text-sm text-neutral-700"
            />
            <div>
              <CopyButton text={socialPost} label="Copy social post" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-neutral-600">Parent email</p>
            <textarea
              readOnly
              rows={4}
              value={parentBlurb}
              className="rounded-lg border border-neutral-200 p-2 text-sm text-neutral-700"
            />
            <div>
              <CopyButton text={parentBlurb} label="Copy email text" />
            </div>
          </div>
        </Card>
      </div>

      <Card className="hidden flex-col items-center gap-6 py-10 text-center print:flex">
        <div className="flex flex-col items-center gap-2">
          <h1 className="font-heading text-4xl font-extrabold text-primary-600">
            📚 {fair.name}
          </h1>
          <p className="text-lg text-neutral-700">
            {fair.start_date} – {fair.end_date}
          </p>
          <p className="font-heading text-lg font-bold text-accent-600">{flyerTagline}</p>
        </div>

        {coverBooks.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-4 px-8">
            {coverBooks.map((book) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={book.title}
                src={book.image_url}
                alt={book.title}
                title={book.title}
                className="h-32 w-24 rounded-lg border border-neutral-200 object-cover shadow-sm"
              />
            ))}
          </div>
        )}

        <div className="flex flex-col items-center gap-2">
          {storefrontQr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={storefrontQr}
              alt="Storefront QR code"
              className="h-40 w-40 rounded-lg border border-neutral-200 p-2"
            />
          )}
          <p className="text-base text-neutral-700">Shop online any time at:</p>
          <p className="text-base font-semibold text-neutral-900">{storefrontUrl}</p>
        </div>
      </Card>

      <div className="print:hidden">
        <PrintButton />
      </div>
    </div>
  );
}
