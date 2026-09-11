# EasyBookFair

Book fair consignment platform. See [`docs/spec.md`](./docs/spec.md) for the
full design, [`docs/MANUAL.md`](./docs/MANUAL.md) for intended usage, and
[`docs/CHANGELOG.md`](./docs/CHANGELOG.md) for what's shipped so far.

**Status**: Phase 2 (admin catalog + allocation) — Supabase Auth wiring,
admin catalog CRUD/CSV upload, and the allocation checklist with
lead-time-aware restock handling and a packing suggestion. Org portal,
storefront, and everything Stripe-related are later phases.

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
   - `0006_stock_and_allocation.sql`
   - `0007_seed_carton_specs.sql`
   - `0008_catalog_image_uploads.sql`
   - `0009_receive_stock.sql`
4. Make yourself a platform admin: sign in once at `/login` (magic link)
   so a row exists in Supabase's `auth.users`, then insert your user id
   into `platform_admins` directly (SQL Editor — there's no self-serve
   admin invite flow yet):
   ```sql
   insert into public.platform_admins (user_id)
   values ('<your auth.users id>');
   ```
5. Run the app:
   ```
   npm run dev
   ```

## Deploying

Also deployable to Vercel: import the repo, set the **Production Branch**
(Project Settings → Git) to `claude/new-session-dm851x` since that's where
this project's work lives, and add the three variables from `.env.example`
under Project Settings → Environment Variables — `NEXT_PUBLIC_*` ones can
use the "Config" type, `SUPABASE_SERVICE_ROLE_KEY` should stay "Secret".
Every push to that branch triggers a new deployment automatically.

## Design system

`components/ui/` holds the shared primitives (`Button`, `Input`, `Select`,
`Textarea`, `Card`, `Badge`, `PageHeader`, `Field`) — build new screens on
top of these rather than raw Tailwind classes, so the app stays visually
consistent as it grows. Colors, fonts, and radius are defined once in
`tailwind.config.ts` (playful orange/purple palette, warm cream background,
a rounded heading font loaded via `next/font/google` in `app/layout.tsx`).
`Badge`'s `statusTone()` helper maps the various status/type enum strings
used across the schema to a consistent color meaning — reuse it rather than
inventing new colors per page.

## Known gap

`lib/supabase/types.ts` is still the Phase 1 placeholder — a couple of
joined-column reads in the allocation/fairs pages use an `as unknown as`
cast to work around it. Regenerate real types once a project exists
(command's in that file) and those casts should come out.

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
