export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">EasyBookFair</h1>
      <p className="text-neutral-600">
        Phase 1 foundation — schema, ledger, and seeded chart of accounts are
        in place. Admin, org, and storefront screens land in later phases.
      </p>
      <p className="text-sm text-neutral-500">
        See <code>docs/spec.md</code> for the design, <code>docs/MANUAL.md</code>{" "}
        for intended usage, and <code>docs/CHANGELOG.md</code> for what&apos;s
        shipped so far.
      </p>
    </main>
  );
}
