import { requireFairStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/email";
import { qrCodeDataUrl } from "@/lib/qr";
import { buildSocialPost, buildParentEmailBlurb, buildFlyerTagline } from "@/lib/marketingCopy";
import { Card, CopyButton, PageHeader, PrintButton } from "@/components/ui";
import { FundraiserGoalForm } from "./FundraiserGoalForm";

// Decorative star used only on the printable flyer — inline SVG (not an
// emoji) so it scales/recolors cleanly at any size.
function Star({ fill, className }: { fill: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={fill} aria-hidden="true">
      <polygon points="12,1 15,9 23,9 16.5,14 19,22 12,17 5,22 7.5,14 1,9 9,9" />
    </svg>
  );
}

// fairs.start_date/end_date are plain Postgres `date` columns, returned
// as already-zero-padded "YYYY-MM-DD" strings — reformat via plain
// string splitting rather than `new Date(...).toLocaleDateString()`,
// which would parse the date-only string as UTC midnight and can roll
// it back a day once converted to a non-UTC server timezone.
function formatFlyerDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${month}/${day}/${year}`;
}

// Cycle of small rotation angles for the book-highlight thumbnails on
// the flyer — gives a bit of "scattered stickers" charm regardless of
// how many real covers a fair happens to have (see coverBooks below;
// no upper limit — the flyer prints across as many pages as needed).
const COVER_ROTATIONS = [-9, 6, -4, 7, -6, 5, -8, 4];

// Shared by both app/admin/fairs/[fairId]/marketing/page.tsx and
// app/org/fairs/[fairId]/marketing/page.tsx — requireFairStaff() is the
// actual authorization boundary (a platform admin, or org staff whose
// org owns this specific fair), so either route can render this
// directly with no further gating of its own, same as getRecentSales()
// (app/admin/fairs/[fairId]/sales/actions.ts) does for the sales feed.
export async function MarketingToolkitContent({ fairId }: { fairId: string }) {
  await requireFairStaff(fairId);
  const supabase = await createClient();

  const { data: fair } = await supabase
    .from("fairs")
    .select(
      "id, name, start_date, end_date, allow_online, allow_wallet, fundraiser_goal_amount, fundraiser_description, organizations(name, is_school)",
    )
    .eq("id", fairId)
    .maybeSingle();
  if (!fair) {
    return <p className="text-sm text-red-600">Fair not found.</p>;
  }

  const org = fair.organizations as unknown as { name: string; is_school: boolean } | null;
  const showWallet = fair.allow_wallet && org?.is_school;

  const storefrontUrl = `${siteUrl()}/fairs/${fair.id}`;
  const walletUrl = showWallet ? `${siteUrl()}/fairs/${fair.id}/wallet` : null;

  const fundraiserGoalCard = (
    <Card className="flex flex-col gap-3">
      <h2 className="font-heading font-bold text-neutral-900">Fundraiser goal 🎯</h2>
      <FundraiserGoalForm
        fairId={fair.id}
        goalAmount={fair.fundraiser_goal_amount}
        description={fair.fundraiser_description}
      />
    </Card>
  );

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
        {fundraiserGoalCard}
      </div>
    );
  }

  const [storefrontQr, walletQr, { data: allocatedItems }] = await Promise.all([
    fair.allow_online ? qrCodeDataUrl(storefrontUrl) : Promise.resolve(null),
    walletUrl ? qrCodeDataUrl(walletUrl) : Promise.resolve(null),
    supabase
      .from("allocations")
      .select("catalog_items(title, image_url, price, description)")
      .eq("fair_id", fair.id),
  ]);

  // Only items with a cover image actually add anything visual to the
  // flyer — no cap on count; the book-highlight grid flows across as
  // many printed pages as the fair's real catalog needs (see the
  // break-inside-avoid hints on the grid below).
  const coverBooks = (allocatedItems ?? [])
    .map(
      (a) =>
        a.catalog_items as unknown as {
          title: string;
          image_url: string | null;
          price: number;
          description: string | null;
        } | null,
    )
    .filter(
      (item): item is { title: string; image_url: string; price: number; description: string | null } =>
        !!item?.image_url,
    );

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

        {fundraiserGoalCard}

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

      <div className="hidden flex-col overflow-hidden print:flex print:w-[816px] print:min-h-[11in]">
        {/* Without an explicit @page rule, this prints under the
            browser's default page margins instead of the full
            816x1056px (8.5in x 11in @ 96dpi) canvas this layout
            assumes, which is what pushed the bottom band onto a
            second page. print:min-h-[11in] gives the bottom band's
            mt-auto real free space to push into on the common
            single-page case, so it lands at the bottom of the actual
            page rather than wherever the content happens to end; on a
            fair with enough books to span multiple pages, the
            container simply grows past one page and this has no
            effect (the band still lands right after the last book
            row, same as before). */}
        <style>{`@page { size: 8.5in 11in; margin: 0; }`}</style>

        {/* Top diagonal band */}
        <div
          className="relative shrink-0 bg-accent-600 px-10 pb-10 pt-6 text-white"
          style={{ clipPath: "polygon(0 0, 100% 0, 100% 62%, 0 100%)" }}
        >
          <div className="max-w-[60%] break-words">
            <p className="font-heading text-6xl font-extrabold leading-none">📚 BOOK FAIR</p>
            <p className="mt-3 font-heading text-2xl font-bold text-orange-100">{fair.name}</p>
            {org?.name && <p className="mt-1 text-base font-medium text-white/80">{org.name}</p>}
          </div>
          <Star fill="#FFFFFF" className="absolute right-20 top-9 h-6 w-6 rotate-12" />
          <Star fill="#FFD166" className="absolute right-10 top-20 h-4 w-4 -rotate-12" />
        </div>

        {/* Tagline banner, tucked up and right under the top band's
            stars instead of spanning centered below it. Capped
            narrower than the headline's max-w so a long fair/org name
            and a full-width tagline can never visually collide. */}
        <div className="relative z-10 ml-auto mr-10 -mt-20 w-fit max-w-[240px] rounded-2xl border-4 border-primary-600 bg-white px-6 py-3 text-center shadow-[5px_6px_0_rgba(43,33,24,0.12)]">
          <p className="font-heading text-sm font-bold leading-snug text-accent-600">
            {flyerTagline}
          </p>
        </div>

        {/* Book highlights, built from this fair's real catalog items —
            a fixed 3-column grid keeps row count (and total height)
            predictable in print regardless of description length. */}
        {coverBooks.length > 0 && (
          <div className="grid grid-cols-3 gap-3 px-10 py-6">
            {coverBooks.map((book, i) => (
              <div
                key={book.title}
                className="flex items-center gap-2 break-inside-avoid rounded-lg border border-neutral-100 bg-white p-2 shadow-sm"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={book.image_url}
                  alt={book.title}
                  className="h-36 w-24 shrink-0 rounded-md border-2 border-white object-cover shadow-[0_4px_8px_rgba(43,33,24,0.2)]"
                  style={{ transform: `rotate(${COVER_ROTATIONS[i % COVER_ROTATIONS.length]}deg)` }}
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-neutral-900">{book.title}</p>
                  <span className="mt-0.5 inline-block rounded-full bg-primary-600 px-2 py-0.5 text-[10px] font-bold text-white">
                    ${book.price.toFixed(2)}
                  </span>
                  {book.description && (
                    <p className="mt-0.5 text-[9px] leading-tight text-neutral-600">
                      {book.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Clearance spacer — guarantees blank space for the QR badge's
            upward overlap below, regardless of how many book rows
            (zero or many, across however many pages) precede it. */}
        <div className="h-24" aria-hidden="true" />

        {/* Bottom diagonal band, with the "Scan & shop" QR badge
            overlapping its top-right corner. The diagonal background
            lives on its own absolutely-positioned layer (clip-path
            clips everything painted inside the box it's applied to,
            not just that element's own background) so the badge can
            nest here as a plain sibling of the background layer
            without being clipped itself. */}
        <div className="relative isolate mb-[0.25in] mt-auto flex shrink-0 flex-col justify-end break-inside-avoid break-before-avoid px-10 pb-6 pt-8 text-white">
          <div
            className="absolute inset-0 -z-10 bg-primary-600"
            style={{ clipPath: "polygon(0 26%, 100% 0, 100% 100%, 0 100%)" }}
            aria-hidden="true"
          />
          <p className="font-heading text-3xl font-bold">
            {formatFlyerDate(fair.start_date)} – {formatFlyerDate(fair.end_date)}
          </p>
          <p className="mt-3 text-sm font-semibold text-orange-100">
            Shop online any time, or visit us in person at the fair!
          </p>
          <Star fill="#FFFFFF" className="absolute right-56 top-6 h-5 w-5 rotate-6" />
          <Star fill="#FFD166" className="absolute left-80 top-6 h-3.5 w-3.5 -rotate-12" />
          {storefrontQr && (
            <div className="absolute -top-24 right-10 flex h-[180px] w-[180px] items-center justify-center">
              <svg viewBox="0 0 190 190" className="absolute inset-0 h-full w-full" aria-hidden="true">
                <circle cx="95" cy="95" r="70" fill="#FFD166" />
                <circle cx="165" cy="95" r="30" fill="#FFD166" />
                <circle cx="144.5" cy="144.5" r="30" fill="#FFD166" />
                <circle cx="95" cy="165" r="30" fill="#FFD166" />
                <circle cx="45.5" cy="144.5" r="30" fill="#FFD166" />
                <circle cx="25" cy="95" r="30" fill="#FFD166" />
                <circle cx="45.5" cy="45.5" r="30" fill="#FFD166" />
                <circle cx="95" cy="25" r="30" fill="#FFD166" />
                <circle cx="144.5" cy="45.5" r="30" fill="#FFD166" />
              </svg>
              <div className="relative z-10 flex h-[150px] w-[150px] flex-col items-center justify-center gap-1 rounded-full border-4 border-dashed border-accent-600 bg-white shadow-[0_8px_14px_rgba(43,33,24,0.2)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={storefrontQr} alt="Storefront QR code" className="h-20 w-20" />
                <p className="text-[11px] font-bold tracking-wide text-accent-600">SCAN &amp; SHOP</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="print:hidden">
        <PrintButton />
      </div>
    </div>
  );
}
