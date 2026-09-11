import Link from "next/link";
import { Card } from "@/components/ui";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="font-heading text-4xl font-extrabold text-primary-600">
        📚 EasyBookFair
      </h1>
      <p className="text-neutral-600">
        Admin catalog, allocation, and inventory tools are up and running.
        Org portal and buyer storefront land in later phases.
      </p>
      <Card className="flex flex-col gap-2 text-sm">
        <p className="text-neutral-600">
          See <code>docs/spec.md</code> for the design, <code>docs/MANUAL.md</code>{" "}
          for intended usage, and <code>docs/CHANGELOG.md</code> for what&apos;s
          shipped so far.
        </p>
        <Link href="/login" className="font-semibold text-accent-600 hover:underline">
          Sign in to the admin console →
        </Link>
      </Card>
    </main>
  );
}
