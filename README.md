# EasyBookFair

Book fair consignment platform. See [`docs/spec.md`](./docs/spec.md) for the
full design, [`docs/MANUAL.md`](./docs/MANUAL.md) for intended usage, and
[`docs/CHANGELOG.md`](./docs/CHANGELOG.md) for what's shipped so far.

**Status**: Phase 1 (foundation) — schema, ledger, and seeded chart of
accounts. No screens yet; those start in Phase 2.

## Stack

Next.js (App Router) + Supabase (Postgres, Auth, RLS). See `docs/spec.md`
for the full architecture, including why business logic is split between
Postgres (invariants like ledger balance) and application/Edge Function
code (everything that needs to be unit-tested).

## Local setup

1. Install dependencies:
   ```
   npm install
   ```
2. Point the app at a Supabase project — copy `.env.example` to
   `.env.local` and fill in the values from your project's API settings.
3. Apply the schema — either via the Supabase CLI against that project
   (`supabase db push`), or by running the files in
   `supabase/migrations/` against it directly, in order:
   - `0001_extensions_and_enums.sql`
   - `0002_core_tables.sql`
   - `0003_ledger.sql`
   - `0004_seed_chart_of_accounts.sql`
   - `0005_rls.sql`
4. Run the app:
   ```
   npm run dev
   ```

## Database notes

- `app` is a non-public schema holding RLS predicate helpers
  (`app.is_platform_admin()`, `app.current_org_ids()`) and the ledger
  posting function (`app.post_journal_entry()`). It's deliberately not
  exposed over the API (see `supabase/config.toml`) — call
  `post_journal_entry` only from trusted server-side code over a direct
  Postgres connection, never from the browser.
- Every ledger write should go through `app.post_journal_entry()`, which
  validates debits equal credits before writing anything. A deferred
  constraint trigger on `journal_lines` enforces the same invariant
  independently, in case something ever writes to that table directly.
- RLS is default-deny: tables with no policy for a given role/command
  (e.g. `sales` has no insert policy for `authenticated`) are intentionally
  locked down — those writes only happen via the service-role key from
  trusted server code (webhook handlers, close-fair logic), not this app's
  RLS-governed client.
