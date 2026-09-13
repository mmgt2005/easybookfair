import Link from "next/link";
import { Card } from "@/components/ui";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="font-heading text-4xl font-extrabold text-primary-600">
          📚 EasyBookFair
        </h1>
        <p className="mt-2 text-neutral-600">
          A book fair consignment platform — catalog, allocation, checkout (card, cash, or a
          student wallet), and payouts, all in one place.
        </p>
      </div>

      <Card className="flex flex-col gap-2">
        <h2 className="font-heading font-bold text-neutral-900">
          Run a fair for your school or organization
        </h2>
        <p className="text-sm text-neutral-600">
          No account needed to get started — tell us about your organization and a platform
          admin will follow up to get you set up.
        </p>
        <Link href="/join" className="font-semibold text-accent-600 hover:underline">
          Bring EasyBookFair to your organization →
        </Link>
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="font-heading font-bold text-neutral-900">Submit a book or item</h2>
        <p className="text-sm text-neutral-600">
          Authors and vendors can submit books or merchandise for EasyBookFair to carry — also no
          account needed until it&apos;s approved.
        </p>
        <Link href="/author/submit" className="font-semibold text-accent-600 hover:underline">
          Submit a book or item →
        </Link>
      </Card>

      <Card className="flex flex-col gap-2 text-sm">
        <p className="text-neutral-600">
          Already running a fair, or a platform admin? See <code>docs/MANUAL.md</code> for how
          everything works and <code>docs/CHANGELOG.md</code> for what&apos;s shipped so far.
        </p>
        <Link href="/login" className="font-semibold text-accent-600 hover:underline">
          Sign in →
        </Link>
      </Card>
    </main>
  );
}
