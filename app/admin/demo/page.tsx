import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resetDemoFair } from "./actions";
import { Badge, Button, Card, PageHeader, statusTone } from "@/components/ui";

export default async function DemoFairPage() {
  const supabase = await createClient();

  const { data: fair } = await supabase
    .from("fairs")
    .select("id, name, start_date, end_date, status, organizations!inner(is_demo)")
    .eq("organizations.is_demo", true)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Demo fair 🎓"
        description="A sandbox fair for training — click through allocation, checkout, the storefront, and student wallets without touching real data."
      />

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
            <Badge tone={statusTone(fair.status)}>{fair.status}</Badge>
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
