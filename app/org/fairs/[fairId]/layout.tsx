import Link from "next/link";

// Same reasoning as app/admin/fairs/[fairId]/layout.tsx — every screen
// under a fair (checkout, marketing, pickup, sales, wallets) is otherwise
// a disconnected island with no way back except the browser's own back
// button.
export default function OrgFairLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/org"
        className="text-sm font-semibold text-accent-600 hover:underline print:hidden"
      >
        ← Back to Dashboard
      </Link>
      {children}
    </div>
  );
}
