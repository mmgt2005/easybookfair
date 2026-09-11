# EasyBookFair

Book fair consignment platform. See [`docs/spec.md`](./docs/spec.md) for the
full design, [`docs/MANUAL.md`](./docs/MANUAL.md) for intended usage, and
[`docs/CHANGELOG.md`](./docs/CHANGELOG.md) for what's shipped so far.

**Status**: Phase 3 (Stripe Connect and webhooks) in progress — org Stripe
Connect Express onboarding, the payment webhook (`account.updated`,
`payment_intent.succeeded`), and channel-agnostic sale writing
(`record_sale`/`record_checkout_sale`). Phase 2 (admin catalog + allocation)
is done. Org portal and storefront — the actual buyer-facing checkout that
creates `checkout_sessions` rows and PaymentIntents — are still ahead
(Phase 4); until then the webhook's `payment_intent.succeeded` path has no
real caller yet, though it's validated (see "Stripe setup" below).

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
   - `0010_checkout_and_record_sale.sql`
   - `0011_catalog_item_dimensions.sql`
4. Make yourself a platform admin: sign in once at `/login` (magic link)
   so a row exists in Supabase's `auth.users`, then insert your user id
   into `platform_admins` directly (SQL Editor — there's no self-serve
   admin invite flow yet):
   ```sql
   insert into public.platform_admins (user_id)
   values ('<your auth.users id>');
   ```
5. Set up Stripe (see "Stripe setup" below) if you want to exercise org
   onboarding or the payment webhook — everything else works without it.
6. Run the app:
   ```
   npm run dev
   ```

## Stripe setup

1. From your Stripe dashboard (test mode), grab the secret key
   (Developers → API keys) for `STRIPE_SECRET_KEY`.
2. Create a webhook endpoint (Developers → Webhooks) pointing at
   `<your-deployment-url>/api/webhooks/stripe`, subscribed to at least
   `account.updated` and `payment_intent.succeeded`. Its signing secret is
   `STRIPE_WEBHOOK_SECRET`. Stripe can't reach `localhost` directly — use
   the Stripe CLI (`stripe listen --forward-to localhost:3000/api/webhooks/stripe`)
   for local dev, or test against a deployed URL.
3. Org onboarding: on `/admin/organizations/<id>/edit`, "Start Stripe
   onboarding" creates a Connect Express account and sends you to Stripe's
   hosted flow. `charges_enabled`/`payouts_enabled` only update once the
   `account.updated` webhook actually confirms them — not just from
   clicking through the link.
4. There's no buyer-facing checkout yet (Phase 4), so nothing currently
   creates a `checkout_sessions` row or a real PaymentIntent with matching
   metadata — the `payment_intent.succeeded` path is validated (signature
   verification, idempotency, atomic multi-unit writing) but has no live
   caller until then. To exercise it manually: insert a `checkout_sessions`
   row via SQL with a `payment_intent_id` you control, then use
   `stripe trigger payment_intent.succeeded` (Stripe CLI) or the dashboard
   to fire a matching test event.

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
- `record_sale()` is the channel-agnostic sale writer (one write path for
  card/online and cash, branching only the journal entry pattern);
  `record_checkout_sale()` wraps it to process an entire cart atomically
  from the webhook — a `for update` lock plus a status check on
  `checkout_sessions` is what actually makes a redelivered
  `payment_intent.succeeded` event safe to reprocess, not the
  `webhook_events` table alone (see the comment on `record_checkout_sale`
  in migration `0010` for the one gap that tradeoff leaves: a failed
  attempt needs manual reconciliation, not automatic retry).
