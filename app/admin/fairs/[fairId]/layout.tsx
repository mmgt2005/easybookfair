import Link from "next/link";

// Every screen under a fair (edit, allocations, checkout, labels,
// marketing, pickup, promotions, returns, sales, wallets) is otherwise a
// disconnected island with no way back except the browser's own back
// button — this one shared layout gives all of them a back link at once.
// Each page already shows the fair's own name in its own header, so this
// bar deliberately doesn't repeat it.
export default function FairLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/fairs"
        className="text-sm font-semibold text-accent-600 hover:underline print:hidden"
      >
        ← Back to Fairs
      </Link>
      {children}
    </div>
  );
}
