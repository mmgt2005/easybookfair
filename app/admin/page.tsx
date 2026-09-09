import Link from "next/link";

export default function AdminHome() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Admin</h1>
      <p className="text-sm text-neutral-600">
        The real admin dashboard (active fairs, revenue/wholesale-owed
        totals, pending applications) is a later phase. For now:
      </p>
      <ul className="flex flex-col gap-2 text-sm">
        <li>
          <Link href="/admin/catalog" className="underline">
            Catalog
          </Link>{" "}
          — add items, bulk upload
        </li>
        <li>
          <Link href="/admin/organizations" className="underline">
            Organizations
          </Link>{" "}
          — minimal scaffolding to create a test org (the real application
          review + Stripe Connect onboarding flow is Phase 3)
        </li>
        <li>
          <Link href="/admin/fairs" className="underline">
            Fairs
          </Link>{" "}
          — create a fair, then allocate inventory to it
        </li>
      </ul>
    </div>
  );
}
