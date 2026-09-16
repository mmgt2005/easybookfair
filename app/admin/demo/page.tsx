import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resetDemoFair } from "./actions";
import { DemoToggleButton } from "./DemoToggleButton";
import { stripeMode } from "@/lib/stripe";
import { Badge, Button, Card, PageHeader, statusTone } from "@/components/ui";

export default async function DemoFairPage() {
  const supabase = await createClient();

  const { data: fair } = await supabase
    .from("fairs")
    .select(
      "id, name, start_date, end_date, status, allow_online, allow_wallet, organizations!inner(is_demo, is_demo_enabled, is_school)",
    )
    .eq("organizations.is_demo", true)
    .maybeSingle();

  const org = fair?.organizations as unknown as {
    is_demo_enabled: boolean;
    is_school: boolean;
  } | null;
  const isDemoEnabled = org?.is_demo_enabled ?? true;
  const mode = stripeMode();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Demo fair 🎓"
        description="A sandbox fair for training — click through allocation, checkout, the storefront, and student wallets without touching real data."
      />

      <Card
        className={`max-w-lg text-sm ${
          mode === "live"
            ? "border border-red-200 bg-red-50 text-red-800"
            : mode === "test"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-amber-200 bg-amber-50 text-amber-800"
        }`}
      >
        {mode === "live"
          ? "⚠️ Stripe is configured in LIVE mode — payments against the demo fair charge real cards."
          : mode === "test"
            ? "Stripe is configured in TEST mode — payments against the demo fair use sample cards only."
            : "Stripe isn't configured — payments against the demo fair will fail."}
      </Card>

      {!fair ? (
        <p className="text-sm text-red-600">
          Demo fair not found — was migration 0035 applied?
        </p>
      ) : (
        <Card className="max-w-lg">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-heading font-bold text-neutral-900">{fair.name}</h2>
              <p className="text-sm text-neutral-600">
                {fair.start_date} – {fair.end_date}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={isDemoEnabled ? "success" : "neutral"}>
                {isDemoEnabled ? "Enabled" : "Disabled"}
              </Badge>
              <Badge tone={statusTone(fair.status)}>{fair.status}</Badge>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <Link
              href={`/admin/fairs/${fair.id}/allocations`}
              className="font-semibold text-accent-600 hover:underline"
            >
              Allocations
            </Link>
            <Link
              href={`/admin/fairs/${fair.id}/checkout`}
              className="font-semibold text-accent-600 hover:underline"
            >
              Checkout
            </Link>
            <Link
              href={`/admin/fairs/${fair.id}/pickup`}
              className="font-semibold text-accent-600 hover:underline"
            >
              Pickup
            </Link>
            <Link
              href={`/admin/fairs/${fair.id}/sales`}
              className="font-semibold text-accent-600 hover:underline"
            >
              Sales
            </Link>
            <Link
              href={`/admin/fairs/${fair.id}/wallets`}
              className="font-semibold text-accent-600 hover:underline"
            >
              Wallets
            </Link>
            <Link
              href={`/admin/fairs/${fair.id}/promotions`}
              className="font-semibold text-accent-600 hover:underline"
            >
              Promotions
            </Link>
            {(fair.allow_online || (fair.allow_wallet && org?.is_school)) && (
              <Link
                href={`/admin/fairs/${fair.id}/marketing`}
                className="font-semibold text-accent-600 hover:underline"
              >
                Marketing
              </Link>
            )}
            <Link
              href={`/admin/fairs/${fair.id}/edit`}
              className="font-semibold text-accent-600 hover:underline"
            >
              Edit
            </Link>
          </div>

          <div className="mt-3 flex flex-col gap-1 border-t border-neutral-100 pt-3 text-sm">
            <a
              href={`/fairs/${fair.id}`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-accent-600 hover:underline"
            >
              Public storefront ↗
            </a>
            <a
              href={`/fairs/${fair.id}/wallet`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-accent-600 hover:underline"
            >
              Public wallet funding ↗
            </a>
            {!isDemoEnabled && (
              <p className="text-xs text-neutral-500">
                Both links currently refuse everyone, including admins, since the demo fair is
                disabled below.
              </p>
            )}
          </div>

          <div className="mt-4 border-t border-neutral-100 pt-3">
            <p className="mb-2 text-xs text-neutral-500">
              When enabled, the demo&apos;s public storefront and wallet-funding pages only render
              for a signed-in admin — never for a stray visitor with the link. Disabling turns them
              off entirely, admin included.
            </p>
            <DemoToggleButton enabled={isDemoEnabled} stripeMode={mode} />
          </div>

          <form action={resetDemoFair} className="mt-4 border-t border-neutral-100 pt-3">
            <p className="mb-2 text-xs text-neutral-500">
              Clears every sale, checkout, wallet, and settlement made against the demo fair, and
              restores its catalog stock/allocations to a fixed starting point — irreversible, but
              safe any time since nothing here is real.
            </p>
            <Button type="submit" variant="outline" size="sm">
              Reset demo data
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
