# EasyBookFair

Book fair consignment platform. See [`docs/spec.md`](./docs/spec.md) for the
full design, [`docs/MANUAL.md`](./docs/MANUAL.md) for intended usage, and
[`docs/CHANGELOG.md`](./docs/CHANGELOG.md) for what's shipped so far.

**Status**: Phase 3 (Stripe Connect and webhooks) done, and most of Phase 4
(buyer payment options) pulled forward alongside it — four working ways to
buy: a physical Stripe Terminal reader at the table
(`/admin/fairs/<id>/checkout`), a public online storefront with same-day
pickup at the fair (`/fairs/<id>`), a parent-funded student wallet a kid
spends down independently (`/fairs/<id>/wallet`, schools only), and a
"Charge $X in cash" button right on the checkout screen (migration
`0043`, `record_cash_sale()`). All four write through the same
channel-agnostic `record_sale()`/ledger core. Phase 2 (admin catalog + allocation) is done.
Buyer-facing polish since then: cover-image storefront browsing with
search/category/sort, order recovery by email, item titles carried through
to the pickup/confirmation screens, and confirmation emails via Resend for
both online orders and wallet fundings.

An **org staff portal** (`/org`) now exists too: an org requests a fair
(with each buyer payment option explained before they choose it) instead
of an admin creating one directly, and an admin reviews/approves it from
`/admin/fair-requests` — approving copies the requested dates and payment
choices into a real `fairs` row, sends the requester an email pointing
them at their dashboard, and (if they asked for the in-person reader) sets
an equipment rental fee that's netted against their payout. Payment
options are enforced per fair (online/wallet/in-person can each be turned
off), not just decorative — both the org portal and the fair's admin edit
page show the actual buyer-facing links.

Org staff can now also run their own fair day-of, not just request and
track it: `/org/fairs/<id>/{checkout,pickup,wallets,sales}` (migration
`0046`) mirror the admin equivalents exactly — same `CheckoutClient`,
same Server Actions — because the underlying RPCs (`record_cash_sale`,
`spend_from_wallet`, `mark_checkout_picked_up`, `close_wallets_for_fair`)
now check `app.can_operate_fair()` (a platform admin, or an org member
whose org owns that specific fair) instead of admin-only. A different
org's staff, or a non-member, still gets rejected — both at the RPC layer
and by `requireFairStaff()` (`lib/auth.ts`), the shared page/action gate
both route trees call.

A **live sales feed** (`/admin/fairs/<id>/sales`, `/org/fairs/<id>/sales`)
shows every completed sale for a fair — item, channel, price, timestamp —
plus a running units/revenue total, refreshing every few seconds
(polling `getRecentSales()`, diffed by row id rather than a `sold_at`
cursor — two sales can land in the same instant, since
`record_cash_sale`/`spend_from_wallet` insert one row per unit in a tight
loop). No new schema or RLS needed — `sales_select` (migration `0005`)
already scoped this correctly for both admin and org staff.

The same action also computes a live **payout estimate** — `close_fair()`'s
own formula (migration `0036`: the credit balance of Org Payable `2000`,
minus the debit balance of A/R `1300`, minus the fair's equipment rental
fee), read straight from `journal_entries`/`journal_lines` rather than
waiting for the fair to actually close. Verified against `close_fair()`
directly (recorded a card and a cash sale, read the live estimate, closed
the fair, confirmed `settlements.net_payout` matched exactly). Once a
`settlements` row exists for the fair, the feed shows that locked-in
figure instead and labels it "Final payout" rather than an estimate.

Org staff also get a **marketing toolkit** (`/org/fairs/<id>/marketing`,
mirrored for admins at `/admin/fairs/<id>/marketing` — both routes render
the same `MarketingToolkitContent`, gated by `requireFairStaff()`, the
same admin-or-that-fair's-org-staff check used for checkout/pickup/
wallets/sales) for each fair — the storefront/wallet links with copy
buttons, a QR code for each (`qrcode` package, rendered as a `data:`
image, no external service), a printable one-page flyer (its own route,
so `window.print()` prints only the flyer — same reasoning as the wallet
donation receipt page), and ready-to-copy social-media/email text
templated from the fair's real name, dates, and links. Linked from
`/org`'s "Share with buyers" column, and from the admin fairs
list/edit/demo screens alongside the same buyer-facing links they
already show.

Orgs can also **request an author reading or book signing**
(`event_requests`, migration `0049`) for a book already allocated to one
of their fairs, from `/org/events/request` — mirrors the `fair_requests`
review pattern exactly (org proposes, admin reviews at
`/admin/event-requests`, no authenticated update policy). A composite
foreign key ties `(fair_id, catalog_item_id)` straight to `allocations`,
so a request for a book that isn't actually at that fair is rejected at
the database level. The admin screen reverse-looks-up the author via
`author_submissions` for display, but never auto-emails them — coordinating
the actual event is a manual step for the admin. That lookup falls back to
optional `author_name`/`author_email`/`author_phone` columns directly on
`catalog_items` (migration `0051`) for a book an admin added without an
author submission, so there's still a contact on file to reach — those
same three fields (plus a new `phone` on `authors`/`author_submissions`)
are editable from the catalog item's create/edit forms and the author
submission form respectively.

A big batch pulling several later-phase pieces forward at once:

- **Promotions/bundle discounts** (`/admin/fairs/<id>/promotions`): percent-off
  or "any N for $X" bundle deals, scoped per fair, applied automatically —
  not buyer-chosen — across all four checkout paths (online, in-person,
  wallet, cash). See `lib/promotions.ts`. Each promotion has an **Edit**
  button, not just activate/deactivate/delete — reopens the same form,
  prefilled, as an update instead of a new row.
- **Closing a fair** (`/admin/fairs/<id>/edit`): a real, if deliberately
  scoped-down, `close_fair()` — computes payout (or amount owed) straight
  from the ledger, nets the equipment rental fee, and locks it. A button
  right there then actually moves the money: **Send payout** fires a
  Stripe Transfer to the org's Connect account (net payout owed to them),
  or **Create payment link** generates a one-time Stripe Payment Link and
  emails it to the org (net amount they owe the platform). Missing-
  inventory cost still isn't computed (no returns-recording feature
  exists to drive it).
- **Wallet close-out donation notice**: closing a fair's wallets now emails
  each parent with unspent balance a link to a printable/downloadable
  receipt (`/fairs/<id>/wallet/receipt/<walletId>`).
- **A demo/training fair** (`/admin/demo`), seeded and resettable, for
  clicking through catalog/allocation/checkout/storefront/wallet flows
  without touching real data.
- **An onboarding tour** in both `/admin` and `/org` — auto-shows once per
  browser, and stays reachable afterward from a "🎓 Take the tour" nav
  link.
- **Author submissions** (`/author/submit`, public, no login): authors
  submit books/merchandise with a suggested retail price (65% wholesale
  auto-calculated), plus a required front cover, back cover, and interior
  PDF for admin review (migrations `0047`/`0048` — `NOT NULL` at the
  schema level, not just required by the form); admin review at
  `/admin/author-submissions` shows both covers and a link to the interior
  PDF; approving invites the author to a real account and adds the item to
  the catalog using the front cover as its image. A minimal author portal
  (`/author`) shows submission status and, once approved, units
  sold/revenue.
- **Organization signups** (`/join`, public, no login; migration `0045`):
  the organization-side equivalent — a school or org expresses interest
  with no account, admin review at `/admin/org-signups`, approving creates
  the real `organizations` row, invites the contact to a real account, and
  adds them as org staff so `/org` lets them in immediately to request
  their first fair. Deliberately at `/join`, not under `/org` — the
  middleware gates every `/org/*` path behind an existing session, so a
  public, no-login form can't live there. The landing page (`/`) — a
  fundraising-focused page covering how it works, feature highlights, who
  it's for, and an FAQ — links to both this and author submissions,
  alongside admin/org staff sign-in.
- **Admin "view as"** (`/admin/organizations`, `/admin/authors`): an admin
  can preview and act in the org or author portal as a specific
  org/author — a "View as" link switches into it (an amber banner makes
  it unmistakable), and "Stop viewing as" switches back. This is a scoped
  cookie-based preview, **not a real session swap** — the admin never
  holds that org/author's actual credentials, and every write made this
  way is still truthfully attributed to the admin (`submitted_by_admin_id`
  on the resulting row) alongside the org/author it was made on behalf
  of, rather than forging who physically clicked submit.

Still ahead: Tap to Pay/Bluetooth-reader support (needs a native mobile
companion app — not reachable from a browser), and missing-inventory
cost as part of closing a fair (needs a real returns-recording feature
first).

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
   - `0033_fair_requests_email.sql`
   - `0034_fairs_equipment_rental_fee.sql`
   - `0035_demo_fair.sql`
   - `0036_close_fair.sql`
   - `0037_wallet_donation_receipt.sql`
   - `0038_promotions_fair_scope.sql`
   - `0039_spend_from_wallet_promotions.sql`
   - `0040_author_submissions.sql`
   - `0041_admin_view_as.sql`
   - `0042_settlement_reconciliation.sql`
   - `0043_record_cash_sale.sql`
   - `0044_demo_admin_lockdown.sql`
   - `0045_org_signups.sql`
   - `0046_org_staff_fair_operations.sql`
   - `0047_author_submission_files.sql`
   - `0048_author_submission_files_required.sql`
   - `0049_event_requests.sql`
   - `0050_event_requests_catalog_item_fk.sql`
   - `0051_catalog_author_contact.sql`
4. Make yourself a platform admin: sign in once at `/login` (magic link)
   so a row exists in Supabase's `auth.users`, then insert your user id
   into `platform_admins` directly (SQL Editor — there's no self-serve
   admin invite flow yet):
   ```sql
   insert into public.platform_admins (user_id)
   values ('<your auth.users id>');
   ```
5. To try the org portal (`/org`), either add someone to `org_members`
   directly:
   ```sql
   insert into public.org_members (org_id, user_id, role)
   values ('<organizations.id>', '<their auth.users id>', 'org_staff');
   ```
   or go through the real flow: submit `/join` (no login), then approve it
   from `/admin/org-signups` — this creates the organization, invites the
   contact by email, and adds them as org staff in one step (migration
   `0045`).
6. Set up Stripe (see "Stripe setup" below) if you want to exercise org
   onboarding or the payment webhook — everything else works without it.
7. The demo/training fair (`/admin/demo`) and its five `[Demo]`-prefixed
   catalog items are already seeded by migration `0035` — nothing to set
   up, just sign in as an admin and click through it. Its public
   storefront/wallet links (migration `0044`) only render for a signed-in
   admin and can be switched off entirely from `/admin/demo`, which also
   shows whether `STRIPE_SECRET_KEY` is currently in test or live mode —
   worth checking before clicking through demo checkout with live keys
   configured. An author account only exists after you approve a
   submission from `/admin/author-submissions` (try `/author/submit`
   yourself first, with any email — Supabase's own invite email needs the
   project's SMTP/auth email configured to actually arrive; the submission
   itself doesn't).
8. Run the app:
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
   `account.updated`, `payment_intent.succeeded`, `checkout.session.
   completed`, and `transfer.reversed` (the last two back settlement
   reconciliation — see step 9 below). Its signing secret is
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
8. Settlement payouts: once a fair is closed (`/admin/fairs/<id>/edit`,
   "Settlement" card), **Send payout** fires a real Stripe Transfer to the
   org's Connect account — needs that org to have finished onboarding
   (`stripe_payouts_enabled`, from step 3) and the platform's own Stripe
   balance to actually cover the amount (in test mode, top up the
   platform's test balance, or expect an "insufficient funds" error from
   Stripe if you haven't). **Create payment link** (shown instead when the
   org owes the platform) needs no special setup — it's a normal one-time
   Stripe Payment Link on the platform's own account.
9. Settlement reconciliation: a Transfer is confirmed the moment it's
   sent (no webhook needed — see the Database notes below for why), but
   whether a payment link has actually been *paid* only ever arrives via
   the `checkout.session.completed` webhook event from step 2 — without
   it subscribed, the "⏳ Awaiting payment" state on the edit page and
   the org's dashboard will never flip to "✅ Paid" even after the org
   pays. `transfer.reversed` (also step 2) catches the rare case of a
   transfer later being clawed back.

## Deploying

Also deployable to Vercel: import the repo, set the **Production Branch**
(Project Settings → Git) to `claude/new-session-dm851x` since that's where
this project's work lives, and add the variables from `.env.example` under
Project Settings → Environment Variables — `NEXT_PUBLIC_*` ones (including
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) can use the "Config" type,
`SUPABASE_SERVICE_ROLE_KEY`/`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/
`RESEND_API_KEY` should stay "Secret". Every push to that branch triggers a
new deployment automatically.

Set `NEXT_PUBLIC_SITE_URL` once you have a real domain (custom or
Vercel's own) — `siteUrl()` (`lib/email.ts`) falls back sensibly without
it, but an explicit value is the most reliable option. Without it, on a
project with no production domain configured, links (email links, and
the org marketing toolkit's storefront QR code) can fall all the way
back to the current deployment's own unique URL (`VERCEL_URL`), which
Vercel's Deployment Protection commonly puts behind a login wall — a
buyer scanning that QR code would hit a Vercel login page instead of the
storefront.

**Also update Supabase's own Auth URL Configuration** (Supabase dashboard
→ Authentication → URL Configuration) once you have a real domain —
`app/login/page.tsx`'s magic link passes `emailRedirectTo:
<your-domain>/auth/callback` (`app/auth/callback/route.ts`), but Supabase
only honors that override if it's listed under **Redirect URLs**;
otherwise it silently falls back to the project's **Site URL** instead.
If that fallback still points at `localhost` or an old preview domain (or
if the Site URL itself is just the bare domain with no path), a magic
link click lands on `/` with no session ever established — indistinguishable
from "the sign-in link didn't work." Add `<your-domain>/auth/callback`
(and `http://localhost:3000/auth/callback` for local dev) to Redirect
URLs, and set Site URL to your real production domain, whenever the
domain changes.

**Watch for a `www` vs. bare-domain mismatch** — a real case that hit
this exact failure mode: the site was reachable at both
`https://yourdomain.com` and `https://www.yourdomain.com`, but only the
bare domain was in Redirect URLs. `emailRedirectTo` is built from
`window.location.origin` (`app/login/page.tsx`), so a visitor on the
`www` version requests `https://www.yourdomain.com/auth/callback` —
a different origin than the allowlisted one — and Supabase falls back to
Site URL exactly as above. Either add both variants to Redirect URLs, or
better, pick one canonical domain (Vercel → Project → Settings →
Domains, set one as primary so the other 308-redirects to it) and make
Site URL/Redirect URLs/`NEXT_PUBLIC_SITE_URL` all agree with it.

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
- No self-serve invite flow for `platform_admins` or `org_members` —
  both are manual `insert` statements run directly against the database
  (see "Local setup" above). An org admin can't add their own staff from
  the UI yet. (`authors` is different — it's populated automatically when
  an admin approves a submission, no manual insert needed.)
- `close_fair()` (migration `0036`) is deliberately scoped down from the
  full settlement spec: it nets the equipment rental fee and whatever the
  ledger already shows for card/online margin and cash-sale wholesale
  owed, but `missing_inventory_cost` is hardcoded `0` (no
  returns-recording feature exists to drive it — `allocations.
  quantity_returned` exists in the schema but nothing ever writes it).
  Moving the money is a real button now (`sendSettlementPayout`/
  `createSettlementPaymentLink`, `app/admin/fairs/actions.ts`), and both
  are reconciled: a Transfer is marked confirmed synchronously (it has no
  separate pending state), with `transfer.reversed` catching the rare
  later clawback; a Payment Link's `payment_link_paid_at` only ever gets
  set by the `checkout.session.completed` webhook event actually firing
  — if that event isn't subscribed on the Stripe webhook endpoint (see
  "Stripe setup" step 2), a paid link will sit showing "⏳ Awaiting
  payment" forever even though the org already paid. There's also no
  idempotency key on the Transfer/Price/Payment Link calls themselves —
  the disabled-once-sent button is the real guard against a double-send,
  not a network-level safeguard, which is fine at this app's
  one-admin-clicking-once scale.
- The onboarding tour's "seen it" state is per-browser (`localStorage`),
  not per-account — a new browser/device shows it again regardless of
  whether that person has seen it elsewhere. Acceptable since the "🎓 Take
  the tour" nav link makes it available on demand either way, not just on
  a tracked first visit.
- Author accounts are created via Supabase Auth's own
  `admin.inviteUserByEmail` (a separate email from Resend's — needs the
  Supabase project's own auth email/SMTP configured to actually be
  delivered, `RESEND_API_KEY`/`EMAIL_FROM` don't cover it). A returning
  author whose email is already registered is detected by paging through
  `admin.listUsers()` rather than a direct lookup (supabase-js has no
  `getUserByEmail`) — fine at this app's scale, not for a very large user
  base.
- Admin "view as" only covers the org and author portals — there's
  nothing to impersonate on the buyer storefront (`/fairs/<id>` is
  already public with no login, so an admin can just open it directly).
  Its "seen" state and everything about the underlying session belongs to
  the admin's own real login; the view-as cookie only changes which
  org/author the org/author portal renders as, not who's actually
  authenticated.

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
- `close_fair()` (migration `0036`) reads `payout_due`/`cash_wholesale_owed`
  straight off the ledger — the net balance of Org Payable (`2000`) and
  Accounts Receivable (`1300`) for that fair — rather than re-deriving them
  from `sales`. That's deliberate: it automatically nets in refunds and the
  wallet close-out credit (`close_wallets_for_fair()`, migration `0022`)
  without this function needing to know about either. Its own settlement
  entry always nets to a debit of exactly `payout_due` against Org
  Payable, clearing it to zero regardless of whether the org is owed money
  or owes it — see the migration's comment for the derivation. `fairs`
  gained `equipment_rental_fee` (migration `0034`, admin-set — the org
  doesn't price the hardware it's renting) and `settlements` gained a
  matching column, folded into `total_owed_by_org`'s check constraint.
- `promotions` (migration `0038` adds `fair_id`, scoping what was
  previously an unused platform-wide table to one fair) drives
  `lib/promotions.ts`'s `applyPromotions()` — pure, framework-free, and
  shared by all three checkout paths (guest, in-person, wallet) rather
  than reimplemented per path or in SQL. It can split one cart line into
  more than one output line (e.g. some units bundled at a flat price, the
  remainder at full price) since `checkout_sessions.line_items` and
  `record_sale()` both already snapshot one price per line — see the
  module comment for the full algorithm (bundles resolved first, against
  a richest-item-first pool; percent discounts against whatever's left).
  `spend_from_wallet()` (migration `0039`) now accepts an explicit
  `price_charged`/`promotion_id` per line instead of always pricing from
  `catalog_items` itself, falling back to the catalog price when a line
  doesn't specify one.
- `author_submissions`/`authors` (migration `0040`) mirror the
  `fair_requests`/`fairs` review pattern: a staging table with no update
  policy for `authenticated` (only `app.is_platform_admin()` can move
  `status`), approving creates the "real" rows (here, a Supabase auth user
  plus a `catalog_items` row) and links back via `author_user_id`/
  `catalog_item_id`. `wholesale_price` is a generated column
  (`round(suggested_retail_price * 0.65, 2)`) rather than app-computed, so
  it can never drift from the retail price independently. `sales_select_
  author` is an additive RLS policy (Postgres OR's multiple permissive
  policies for the same command together) — it doesn't touch or replace
  `sales_select`'s existing org/admin scoping. Migration `0047` renames
  `image_url` to `front_cover_image_url` (still the field copied to
  `catalog_items.image_url` on approval) and adds `back_cover_image_url`/
  `interior_pdf_url`, all uploaded to the same public `author-submissions`
  bucket as before — no new storage policies needed since they already
  allow any file under that bucket, not just images. Migration `0048`
  makes all three `NOT NULL`, matching every other required field on this
  table, once the form started requiring them too.
- Admin "view as" (migration `0041`, `lib/viewAs.ts`) is deliberately
  **not** a real session swap — an admin never holds an org/author's
  actual credentials, only a routing cookie that `requireOrgStaff()`/
  `requireAuthor()` honor after independently re-checking
  `app.is_platform_admin()` against the caller's own real session; the
  cookie carries no authority by itself. Two consequences fall out of
  that: (1) `/org`/`/author` pages that previously relied on RLS to
  auto-scope a genuine member's own session (`org_id in
  app.current_org_ids()`, `author_user_id = auth.uid()`) now filter
  explicitly by the id `requireOrgStaff()`/`requireAuthor()` returns
  instead — an admin's own RLS access already sees every org/author's
  rows via `is_platform_admin()`, so without an explicit filter they'd
  see everyone's data mixed together rather than just the one they're
  previewing. (2) Writing as an impersonated org/author needs its own
  insert policies (`fair_requests_admin_insert`/
  `author_submissions_admin_insert`, unconditional for any admin) since
  the existing ones check the row against the *caller's* `auth.uid()`,
  which is the admin's own id, never the target's. Those new policies
  drop the "does this insert belong to you" check entirely, so it's the
  application code — not RLS — that's responsible for setting
  `org_id`/`author_user_id` to the correct impersonated target rather
  than trusting client input (see `submitAuthorSubmission`, which
  deliberately stopped trusting a client-supplied `author_user_id` once
  this policy existed). `submitted_by_admin_id` keeps the resulting row
  truthful about who actually clicked submit.
- `settlements.stripe_transfer_id`/`stripe_payment_link_id` (columns from
  Phase 1's original `settlements` table, migration `0003` — nothing
  wrote to either until now) are set by `sendSettlementPayout()`/
  `createSettlementPaymentLink()` (`app/admin/fairs/actions.ts`) once an
  admin clicks the corresponding button on a closed fair's edit page —
  no new migration needed for this. A Payment Link needs an actual
  `Price` object, unlike a Checkout Session (which accepts inline
  `price_data`) — `createSettlementPaymentLink()` calls
  `stripe.prices.create()` with `product_data` to make a one-off Price
  on the fly, since the amount differs per settlement. Both run on the
  platform's own Stripe account (`getStripe()`), the same
  merchant-of-record model as every other charge in this app — a payment
  link charges the org, it doesn't originate from their Connect account.
- Settlement reconciliation (migration `0042`) splits cleanly along
  Stripe's own sync/async line, not by symmetry between the two paths:
  `transfer_confirmed_at` is set directly inside `sendSettlementPayout()`,
  not by a webhook — a Transfer moves funds between the platform's and a
  connected account's *Stripe balance*, which is synchronous with the API
  call succeeding (unlike a bank Payout, Transfers have no pending
  state); `transfer_reversed_at` catches the one way a confirmed transfer
  can still un-happen later, via the `transfer.reversed` event.
  `payment_link_paid_at`, by contrast, is genuinely asynchronous (the org
  has to actually pay) and can only be set from the
  `checkout.session.completed` webhook event — matched by `session.
  payment_link` against `stripe_payment_link_id`, not by metadata (a
  Payment Link's own `metadata` doesn't propagate to its Checkout Session
  automatically, unlike `payment_intent_data.metadata`, which does
  propagate to the resulting PaymentIntent but wasn't needed here since
  the session already carries the link's id directly). The same
  `payment_intent.succeeded` handler that processes storefront/wallet
  PaymentIntents also fires for a Payment Link's underlying PaymentIntent
  — harmless, since its `metadata.kind` won't match either branch and
  `record_checkout_sale()` no-ops on a `payment_intent_id` with no
  matching `checkout_sessions` row.
- `record_cash_sale()` (migration `0043`) is the RPC behind the checkout
  screen's "Charge $X in cash" button — the fourth and last tender to get
  a UI, mirroring `spend_from_wallet`'s shape exactly: `SECURITY DEFINER`,
  gated internally by `app.is_platform_admin()` (callable by
  `authenticated` directly, not routed through RLS), re-checks
  `allow_cash` and current availability the same way every other checkout
  path does, and accepts a `price_charged`/`promotion_id` per line
  (computed by `lib/promotions.ts` in the calling Server Action) rather
  than pricing from `catalog_items` itself.
- Demo-fair admin lockdown (migration `0044`) adds
  `organizations.is_demo_enabled` (a kill switch, default `true`) and
  extends `fair_public_info()` with `is_demo`/`is_demo_enabled` so the
  anon-callable storefront/wallet pages can decide whether to render at
  all. When `is_demo` is true, the public pages (`app/fairs/[fairId]`,
  `app/fairs/[fairId]/wallet`) and their Server Actions
  (`createGuestCheckout`, `createWalletFunding`) refuse everyone unless
  `is_demo_enabled` is true **and** the visitor is a signed-in platform
  admin (`isPlatformAdmin()`, `lib/auth.ts` — a non-redirecting check, so
  a stray buyer sees a plain "not open to the public" message instead of
  a `/login` bounce). Only the write paths are gated this way — the
  anon-callable `fair_storefront_items` RPC still returns demo catalog
  item names, since leaking read-only `[Demo]`-prefixed titles carries no
  real risk. `stripeMode()` (`lib/stripe.ts`) reads whether
  `STRIPE_SECRET_KEY` is a live or test key from its own prefix (no
  network call) and is shown on `/admin/demo` alongside the enable/disable
  toggle, so an admin can't flip the demo fair on without first seeing
  whether doing so risks a real card being charged.
