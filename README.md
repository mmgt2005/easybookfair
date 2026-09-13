# EasyBookFair

Book fair consignment platform. See [`docs/spec.md`](./docs/spec.md) for the
full design, [`docs/MANUAL.md`](./docs/MANUAL.md) for intended usage, and
[`docs/CHANGELOG.md`](./docs/CHANGELOG.md) for what's shipped so far.

**Status**: Phase 3 (Stripe Connect and webhooks) done, and most of Phase 4
(buyer payment options) pulled forward alongside it — four working ways to
buy: a physical Stripe Terminal reader at the table
(`/admin/fairs/<id>/checkout`), a public online storefront with same-day
pickup at the fair (`/fairs/<id>`), a parent-funded student wallet a kid
spends down independently (`/fairs/<id>/wallet`, schools only), and plain
cash (already existed). All four write through the same channel-agnostic
`record_sale()`/ledger core. Phase 2 (admin catalog + allocation) is done.
Buyer-facing polish since then: cover-image storefront browsing with
search/category/sort, order recovery by email, item titles carried through
to the pickup/confirmation screens, and confirmation emails via Resend for
both online orders and wallet fundings.

An **org staff portal** (`/org`) now exists too: an org requests a fair
(with each buyer payment option explained before they choose it) instead
of an admin creating one directly, and an admin reviews/approves it from
`/admin/fair-requests` — approving copies the requested dates and payment
choices into a real `fairs` row. Payment options are enforced per fair
(online/wallet/in-person can each be turned off), not just decorative.

Still ahead: Tap to Pay/Bluetooth-reader support (needs a native mobile
companion app — not reachable from a browser), promotions/bundle
discounts (schema exists, no checkout path reads it yet), an author
submission flow, a software tour, a demo/training fair, and a
donation-notice email when a closed fair's unused wallet balance sweeps
into the org's payout.

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
   - `0012_deallocate_inventory.sql`
   - `0013_restock_order_date.sql`
   - `0014_fair_terminal_location.sql`
   - `0015_organizations_is_school.sql`
   - `0016_sale_channel_wallet.sql`
   - `0017_wallet_liability_account.sql`
   - `0018_student_wallets.sql`
   - `0019_wallet_fundings.sql`
   - `0020_record_sale_wallet_channel.sql`
   - `0021_spend_from_wallet.sql`
   - `0022_close_wallets_for_fair.sql`
   - `0023_checkout_sessions_pickup.sql`
   - `0024_fair_storefront_items.sql`
   - `0025_public_fair_and_order_lookup.sql`
   - `0026_fair_storefront_items_category.sql`
   - `0027_checkout_sessions_by_email.sql`
   - `0028_wallet_fundings_parent_email.sql`
   - `0029_fair_payment_options.sql`
   - `0030_fair_requests.sql`
   - `0031_fair_public_info_payment_options.sql`
   - `0032_fair_storefront_items_allow_online.sql`
4. Make yourself a platform admin: sign in once at `/login` (magic link)
   so a row exists in Supabase's `auth.users`, then insert your user id
   into `platform_admins` directly (SQL Editor — there's no self-serve
   admin invite flow yet):
   ```sql
   insert into public.platform_admins (user_id)
   values ('<your auth.users id>');
   ```
5. To try the org portal (`/org`), add someone to `org_members` the same
   manual way (also no self-serve invite flow):
   ```sql
   insert into public.org_members (org_id, user_id, role)
   values ('<organizations.id>', '<their auth.users id>', 'org_staff');
   ```
6. Set up Stripe (see "Stripe setup" below) if you want to exercise org
   onboarding or the payment webhook — everything else works without it.
7. Run the app:
   ```
   npm run dev
   ```

## Stripe setup

1. From your Stripe dashboard (test mode), grab the secret key
   (Developers → API keys) for `STRIPE_SECRET_KEY`, and the **publishable**
   key (same page) for `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — the public
   storefront/wallet pages need it client-side for Stripe.js (Elements).
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
4. In-person checkout (physical reader): on a fair's Edit page
   (`/admin/fairs/<id>/edit`), the "Terminal setup" card creates a Stripe
   Terminal Location for that fair's venue, then registers a physical
   reader to it using the registration code shown on the reader's own
   screen. **Only internet-connected readers work here** — BBPOS WisePOS E
   or Stripe Reader S700. Bluetooth readers (BBPOS Chipper 2X BT, Stripe
   Reader M2) and Tap to Pay on iPhone/Android need Stripe's native
   iOS/Android Terminal SDKs, which this web app doesn't use — not
   reachable from a browser at all. Once a reader shows `online`,
   `/admin/fairs/<id>/checkout` builds a cart from that fair's allocated
   stock and charges it (or spends from a student wallet — see below).
5. Online storefront (`/fairs/<id>`, public, no login): buyers browse a
   fair's allocated stock (cover images, search, category filter, sort —
   a "↻ Refresh availability" button reloads the count in case someone
   else just bought the last copy) and check out with Stripe Elements as
   a guest. Paid orders are for **pickup at the fair**, not shipped; the
   confirmation page (`/fairs/<id>/order/<id>`) shows an order code and a
   confirmation email is sent (see step 7). If a buyer loses both,
   `/fairs/<id>/orders` looks orders up by the email given at checkout.
   Admins redeem orders at `/admin/fairs/<id>/pickup`, which now shows the
   actual titles in the cart, not just a count.
6. Student wallets (`/fairs/<id>/wallet`, public, schools only — set
   "Is a school" on the org's edit page first): a parent loads money onto
   a named student's balance (quick $10/$20/$50 preset buttons, or any
   amount); the student then spends it down themselves at the checkout
   table (search by name in the wallet section of
   `/admin/fairs/<id>/checkout` — no login for the student either, same
   name/grade/teacher lookup Scholastic's own eWallet uses). Unspent
   balance does **not** refund or roll over — an admin sweeps it into the
   fair's org payout from `/admin/fairs/<id>/wallets` ("Close eWallets for
   this fair"), a manual, irreversible action.
7. Confirmation emails (Resend): grab an API key from
   [resend.com/api-keys](https://resend.com/api-keys) for
   `RESEND_API_KEY`, and set `EMAIL_FROM` to an address on a domain you've
   verified in Resend (their shared test domain works for local dev, but
   real delivery needs your own verified sending domain). Sent after a
   successful online order or wallet funding — best-effort, a delivery
   failure never fails the underlying payment (see `lib/email.ts`).

## Deploying

Also deployable to Vercel: import the repo, set the **Production Branch**
(Project Settings → Git) to `claude/new-session-dm851x` since that's where
this project's work lives, and add the variables from `.env.example` under
Project Settings → Environment Variables — `NEXT_PUBLIC_*` ones (including
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) can use the "Config" type,
`SUPABASE_SERVICE_ROLE_KEY`/`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/
`RESEND_API_KEY` should stay "Secret". Every push to that branch triggers a
new deployment automatically.

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

## Known gaps

- `lib/supabase/types.ts` is still the Phase 1 placeholder — a couple of
  joined-column reads in the allocation/fairs pages use an `as unknown as`
  cast to work around it. Regenerate real types once a project exists
  (command's in that file) and those casts should come out.
- Order/wallet-funding confirmation emails (Resend, `lib/email.ts`) are
  best-effort — a delivery failure is only logged, never surfaced to the
  buyer or retried. If `RESEND_API_KEY`/`EMAIL_FROM` aren't set, sending
  throws and is caught the same way, so email is silently skipped rather
  than breaking checkout — the confirmation page and `/fairs/<id>/orders`
  lookup remain the reliable fallback either way.
- No promotions/bundle discounts — the `promotions` table exists in the
  schema but no checkout path (online, in-person, or wallet) reads it.
- Available-to-sell checks (online checkout, wallet spending, in-person
  checkout) aren't row-locked the way `allocate_inventory` is — two carts
  finishing at the same instant for the last unit of an item could both
  pass. Fine for one checkout station/reader at a time in practice, not
  safe for high-concurrency simultaneous checkouts without adding real
  locking.
- No Tap to Pay or Bluetooth-reader (M2, Chipper) support — both need
  Stripe's native iOS/Android Terminal SDK, unreachable from a browser.
  Would need a separate native (or React Native) companion app talking to
  the same backend.
- `allow_cash` on `fairs`/`fair_requests` is captured but not enforced —
  there's no cash-sale-recording UI anywhere in the app (cash sales only
  exist at the database/ledger level, from Phase 1). Turning it off
  changes nothing yet.
- No self-serve invite flow for either `platform_admins` or `org_members`
  — both are manual `insert` statements run directly against the
  database (see "Local setup" above). An org admin can't add their own
  staff from the UI yet.
- No onboarding/software tour, no demo/training fair, and no
  wallet-balance donation notice (a printable/downloadable receipt for a
  parent when a closed fair's unused wallet balance becomes the org's) —
  all sized but not yet built.
- No author submission flow (a public form for authors to submit
  books/merchandise with a suggested retail price and an auto-calculated
  65% wholesale cost, reviewed by an admin, approving creates an author
  account) — sized but not yet built.

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
- `record_sale()` is the channel-agnostic sale writer — one write path for
  `cash`, `online`/`in_person` (card), and `wallet`, branching only which
  account gets debited (A/R for cash, Stripe Clearing for card/online, the
  Buyer Wallet Liability account for a wallet spend — migration `0020`) and
  whether an Org Payable margin line applies (cash doesn't get one).
  `record_checkout_sale()` wraps it to process an entire cart atomically
  from the webhook — a `for update` lock plus a status check on
  `checkout_sessions` is what actually makes a redelivered
  `payment_intent.succeeded` event safe to reprocess, not the
  `webhook_events` table alone (see the comment on `record_checkout_sale`
  in migration `0010` for the one gap that tradeoff leaves: a failed
  attempt needs manual reconciliation, not automatic retry).
- Student wallets (migrations `0016`–`0022`) are a second, parallel money
  path: funding a wallet debits Stripe Clearing and credits Buyer Wallet
  Liability (`1400`) — money collected but not yet earned as revenue,
  same shape as a retail gift-card liability — while `spend_from_wallet()`
  relieves that liability the same way a sale relieves inventory.
  Overdraft protection is the table's own `check (balance >= 0)`
  constraint, not application logic: a spend that would overdraw aborts
  the whole call (every `record_sale()` in it included) rather than
  needing its own explicit balance check. Wallets are scoped to one fair,
  not carried across fairs/years, because unused balance becomes that
  fair's org payout at close-out (`close_wallets_for_fair()`) rather than
  the student's own credit for next time.
- The public storefront/wallet-funding pages (`/fairs/<id>`,
  `/fairs/<id>/wallet`) are the only anon-facing (unauthenticated) surface
  in the schema. Rather than opening RLS SELECT policies on
  `catalog_items`/`allocations`/`sales`/`fairs`/`organizations` to `anon`,
  narrow `SECURITY DEFINER` functions (`fair_storefront_items`,
  `fair_public_info`, `get_checkout_session_public`, migrations
  `0024`–`0025`) expose only the specific, buyer-safe shape each page
  needs. The order confirmation page is reachable by the `checkout_sessions`
  row's own id (an unguessable uuid) since there's no buyer login to check
  against — the same access-control shape as e.g. Stripe's own hosted
  receipt links.
- `fair_requests` (migration `0030`) is a separate staging table, not a
  status on `fairs` itself — it keeps "a real, scheduled fair" and "a
  pending ask from an org" from being the same row shape, and reuses the
  existing `application_status` enum rather than inventing a new one.
  Its RLS deliberately has no `update` policy for `authenticated`: an org
  member can insert a request for their own org (`org_id in
  app.current_org_ids()`) but only a platform admin can move it to
  `approved`/`declined`, so an org can't self-approve its own fair.
  Approving copies the requested dates and the four `allow_*` payment-option
  flags onto a new `fairs` row and stamps `fair_requests.fair_id` — the
  flags then live independently on `fairs` and can be adjusted later from
  `/admin/fairs/<id>/edit`.
- The four `allow_online`/`allow_wallet`/`allow_in_person`/`allow_cash`
  flags on `fairs` are enforced at the point of use, not just hidden in
  the UI: `fair_public_info`/`fair_storefront_items` (migrations
  `0031`–`0032`) filter on them for anon callers, and the guest-checkout/
  wallet-funding server actions re-check them before writing — so even a
  direct RPC call against a disabled channel is rejected, not just a
  hidden button.
