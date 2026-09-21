# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Versioning starts here at
`0.1.0` — the build plan's Phases 1-5 (foundation, admin catalog/
allocation, Stripe Connect and all four payment channels, the org portal/
storefront, settlement/close-out) are done and working end-to-end. The
`0.x` prefix reflects that Phase 7 (multi-tenant SaaS, deliberately last)
is still open — see `docs/spec.md`'s "Build plan" for the full phase list.

## [Unreleased]

### Changed

- **The live "payout" estimate no longer deducts missing-inventory
  cost.** `allocated - sold - returned` counts every unit still
  legitimately out for sale as "missing," which for a scheduled/active
  fair is most of the allocation — folding that into the one payout
  number (sales feed, admin dashboard) made it look artificially low or
  negative well before the fair was over. The payout figure is now
  sales-only (card/online margin minus cash-wholesale-owed minus
  equipment rental fee) until the fair actually closes; `close_fair()`
  itself is unchanged and still charges the real cost for real if
  inventory is never returned. The missing-inventory number is now shown
  on its own instead of hidden inside the payout: a new card on the
  sales feed ("If not returned by close" pre-close, "Missing inventory
  charged" once final), a new column on the admin dashboard's Active
  fairs table, and a "⚠️ $X at risk if unsold stock isn't returned" note
  under the org dashboard's Payout column.

## [0.2.0] - 2026-09-21

### Added

- **Fairs automatically move to "return window"** the morning after
  their end date, via a new daily Vercel Cron job
  (`/api/cron/transition-fairs`, configured in `vercel.json`, requires a
  new `CRON_SECRET` env var to authenticate) — this was previously a
  fully manual step ("Move to return window" on the edit page still
  exists for jumping there early). Only `active` fairs are affected; a
  `scheduled` fair whose end date has passed is left alone.

### Fixed

- **"Close this fair" was still on the edit page after also being added
  to the returns screen** — it's now only on the returns screen, since
  receiving returns and then closing is the natural order; the edit
  page's Settlement card links there instead of duplicating the button.

- **"Reset demo data" crashed with a server error** (migration `0056`):
  `reset_demo_fair()` predates `event_requests` (added later in migration
  `0049`), whose FK to `allocations (fair_id, catalog_item_id)` has no
  `on delete cascade`. The moment anyone had ever created an event
  request against the demo fair (e.g. testing "Request an event" from
  the demo org), `delete from allocations` inside the reset hit a
  foreign-key violation and aborted the whole function with an unhandled
  Postgres error — surfacing to the user as a generic "Application
  error: a server-side exception has occurred." `reset_demo_fair()` now
  clears `event_requests` for the demo fair first, same as every other
  table it already resets.

- **A fair could be silently "closed" by accident, bypassing settlement
  entirely**: the fair edit page's plain status dropdown included
  "Closed" as an option alongside Scheduled/Active/Return window — but
  selecting it and saving just did a raw `status` column update, never
  calling `close_fair()`. That meant no settlement row, no journal
  entries, no missing-inventory billing, while every screen that gates
  on `fairs.status` (the returns screen, `receive_allocation_return()`
  itself, the admin dashboard's active-fairs list) would immediately
  start treating the fair as closed anyway — with no way back short of a
  manual database fix. "Closed" is no longer a selectable option in that
  dropdown at all (server-side guard too, not just hidden UI); the only
  way to close a fair is now the dedicated **"Close this fair"** button,
  which now also asks for confirmation first since it's irreversible.
  Added a **"Move to return window"** button for that one safe,
  in-between transition, separate from the general-purpose save form, so
  it doesn't require touching (or risking) anything else on the page.

### Added

- **"Close this fair" button on the returns screen** (`/admin/fairs/<id>/returns`):
  previously only on the edit page's Settlement card, requiring a
  detour after receiving returns. Reuses the same `CloseFairButton`
  component (confirm prompt included); `closeFair()` now also
  revalidates the returns page so it reflects the closed state
  immediately.

### Removed

- **The admin dashboard's four shortcut cards** (Catalog, Organizations,
  Fairs, Carton specs): pure duplication now that the grouped nav bar
  (added in the same batch as checkout scanning, below) reaches all four
  in one or two clicks — the Organizations card's description was also
  stale, still claiming "real review + Stripe onboarding is Phase 3"
  long after both were built.

### Added

- **Checkout scanning, mobile-friendly nav, and back links on secondary
  screens**: checkout previously had no way to add an item except a
  static list with per-row quantity fields — the label QR code linked to
  the admin catalog edit page and wasn't scannable for checkout at all.
  Checkout now has a scan-to-add field (`ScanInput.tsx`) that works with
  a physical USB/Bluetooth barcode scanner (keyboard-wedge: it types the
  code and hits Enter) or a phone/tablet camera (new `html5-qrcode`
  dependency); scanning a known item's code adds one unit to the cart. A
  small "Added ... [Undo]" strip under the scan field corrects the most
  recent scan without hunting for its row, and each line in the Cart
  panel has its own −/+ buttons to adjust or remove it directly. The
  label's QR now encodes the bare `catalog_item_id` instead of a URL
  so the same printed label works for both scanning and its existing
  packer-reference role (title/price/SKU stay printed as text). The
  admin (13 links) and org (4 links) nav bars — previously flat, hand-
  rolled, and just wrapping onto extra lines on narrow screens — are now
  a shared `SiteNav` component with category-grouped desktop dropdowns
  (Fairs, Catalog & authors, Organizations, Setup, Settings) and a
  mobile hamburger menu. `PageHeader` gained an optional `backHref`/
  `backLabel` for a "← Back" link; every fair-scoped admin/org screen
  (edit, allocations, checkout, labels, marketing, pickup, promotions,
  returns, sales, wallets — 15 screens total) now sits under a shared
  layout with a "← Back to Fairs"/"← Back to Dashboard" link, and the
  flat catalog/author/organization/label-template/carton-spec edit and
  creation screens each link back to their own list.

- **Receiving returns from a closed-out fair** (`/admin/fairs/<id>/returns`,
  migration `0055`): `allocations.quantity_returned` existed since the
  very first schema migration but nothing ever wrote it, so there was no
  way to get inventory back into stock after a fair, and `close_fair()`
  hardcoded `missing_inventory_cost` to `0` because of it. A new RPC,
  `receive_allocation_return()`, mirrors `deallocate_inventory()`
  exactly — validates against what's actually still unsold, adds the
  quantity back to `stock_on_hand`, and posts the same Unallocated/
  Consigned journal entry a deallocation posts. `close_fair()` now
  computes a real `missing_inventory_cost` from whatever was allocated
  but neither sold nor returned, billed through the same ledger accounts
  `cash_wholesale_owed` already uses — the settlement display
  (`/admin/fairs/<id>/edit`) already handled a non-zero value here, so no
  UI changes were needed there. The two places that replicate this "live,
  before-close" math (`getPayoutEstimate()` and the admin dashboard's
  aggregate table) got the same fix, so they never silently disagree
  with what `close_fair()` actually charges.
- **Phase 6: QR labels**. Restock timing (lead-time-aware allocation
  checks, the `restock_orders` "reorder now" flow) turned out to already
  be built from earlier allocation work — this batch is the other half.
  `label_templates` (migration `0054`) mirrors `carton_specs`' own
  "configure once, reuse everywhere" pattern: sheet/label dimensions,
  margins, gaps, and grid, admin-only, seeded with an Avery 5160 (3×10
  US-Letter address labels) default. `/admin/label-templates` is the CRUD
  screen; `/admin/fairs/<id>/labels` prints one label per unit allocated
  to that fair, using whichever template is picked, each label showing
  title/price/SKU-ISBN plus a QR code linking to that item's own admin
  edit page (reuses `lib/qr.ts`'s `qrCodeDataUrl()`, built earlier for
  the marketing toolkit — no new QR-generation code). Printing isolates
  just the label sheets via the same `PrintButton`/`window.print()`
  pattern as the wallet receipt and marketing flyer, with an injected
  `@page` rule sizing the print output to the chosen template's actual
  sheet dimensions.

### Fixed

- **Admin pages printed the admin nav bar/view-as banner/tour** — the
  earlier fix for this on the org side (`app/org/layout.tsx`, "flyer
  printing the org nav bar") never touched `app/admin/layout.tsx`, so
  the new labels page inherited the same bug: printing showed the whole
  admin chrome above the label sheets, not just the sheets. Added the
  same `print:hidden`/`print:p-0` treatment to the admin layout's nav,
  view-as banner, content padding, and tour — fixes every printable page
  under `/admin`, not just labels (the admin marketing toolkit route had
  the same latent bug, just never reported).

## [0.1.0] - 2026-09-21

### Added

- **Self-serve admin and org-staff invites**: `platform_admins` gets a
  role column (`super_admin`/`admin`, migration `0053`) — every existing
  admin was promoted to `super_admin` so nobody lost access. A super
  admin can now invite another admin (or promote/demote one) from
  `/admin/platform-admins`, a screen regular admins can't see or reach.
  `org_members`'s `role` column (`org_admin`/`org_staff`, unused until
  now despite existing since migration `0001`) is finally wired up: an
  org admin can invite their own staff, picking their role, from
  `/org/staff`. Fixed a related bug along the way — `approveOrgSignup`
  was adding the org's founding contact as `org_staff` instead of
  `org_admin`, so they couldn't have used the new staff screen at all
  once it shipped. Both invite flows reuse the same invite-or-find-
  existing-account helper (now generalized from author-specific
  `lib/authors.ts` into `lib/accounts.ts`, replacing a third inline copy
  that had crept into `approveOrgSignup`) — no new account-creation logic
  was written, just wired up a fourth and fifth time.
- **Edit an author** (`/admin/authors/<id>/edit`): name/email/phone,
  matching the same simple edit-page pattern as organizations and carton
  specs. Deliberately doesn't touch the underlying Supabase Auth login —
  only the `authors` profile row — since changing a real login email is a
  separate, riskier operation nothing here asks for; the page notes that
  editing the email does still change which catalog items that author's
  own `/author` portal matches via `author_email`.
- **Admin dashboard report**: `/admin` now shows a "Pending applications"
  card (counts + links for fair requests, org signups, author submissions,
  and event requests — the four `application_status`-driven review
  queues) and an "Active fairs" table (every fair not yet closed, with
  units sold, revenue, and an estimated payout per fair plus a totals
  row), replacing the placeholder "later phase" description that used to
  sit above the four navigation shortcut cards. The payout estimate
  reuses the exact same ledger-based formula as the per-fair sales page's
  `getPayoutEstimate()` (`app/admin/fairs/[fairId]/sales/actions.ts`), run
  across every listed fair at once instead of one at a time — safe to skip
  the `settlements` table entirely here, since `close_fair()` always sets
  a fair's status to `closed` in the same transaction it creates that row,
  so no fair in this report's scope (`scheduled`/`active`/`return_window`)
  can ever have one.
- **Catalog-only authors now appear on `/admin/authors` and can be
  "viewed as"**: a catalog item's plain `author_name`/`author_email`/
  `author_phone` contact info (migration `0051`) never had a real account
  behind it, so it never showed up anywhere on the authors screen and
  couldn't be previewed the way `/admin/organizations` lets an admin
  "view as" any org. Unlike an org, `authors.user_id` is a foreign key to
  `auth.users`, so a real account is unavoidable before "view as" can
  work — `/admin/authors` now lists these in a second "no account yet"
  section with a "Create account & view as" button that invites them
  (reusing the same invite-or-find logic `approveAuthorSubmission` used,
  now extracted to `lib/authors.ts`) and drops the admin straight into
  `/author` as them. The invite only fires on that explicit click, never
  automatically from saving contact info on a catalog item. The author
  portal (`/author`) now also shows books linked only by
  `catalog_items.author_email`, with their sales — authorized for a real
  (not admin-viewing-as) author by a new RLS policy,
  `sales_select_author_catalog` (migration `0052`).

### Fixed

- **Marketing toolkit was org-only, unlike every other fair-scoped admin
  screen**: checkout, pickup, wallets, sales, promotions, and allocations
  all exist as both an `/admin/fairs/<id>/...` page and an
  `/org/fairs/<id>/...` page, gated by the shared `requireFairStaff()`
  check (a platform admin, or that fair's own org staff). The marketing
  toolkit only existed at `/org/fairs/<id>/marketing`, gated by
  `requireOrgStaff()` — an admin could only reach it by first "viewing
  as" that org. Extracted the shared rendering into
  `MarketingToolkitContent` (`app/admin/fairs/[fairId]/marketing/`), now
  gated by `requireFairStaff()` like the rest, and added
  `/admin/fairs/<id>/marketing` plus links to it from the admin fairs
  list, fair edit page, and demo fair page — same "Marketing" label,
  same enabling condition (`allow_online` or `allow_wallet` + is a
  school) as everywhere else these buyer links show up.
- **Onboarding tour didn't cover every nav link**: the admin tour
  (migration-era, `app/admin/layout.tsx`) covered 6 of 11 nav items and
  the org tour (`app/org/layout.tsx`) covered 2 of 3 — several features
  added since the tour was first written (Authors, Event requests, Author
  submissions, Carton specs, Demo fair on the admin side; Request an
  event on the org side) never got a step. Added the missing steps, in
  the same order as the nav bar, for both. The author tour
  (`app/author/(portal)/layout.tsx`) already covered both of its nav
  items and needed no changes.
- **Magic-link sign-in could land back on `/` with no session**: not a
  code bug — `app/login/page.tsx`/`app/auth/callback/route.ts` were
  already correct — but a deployment-configuration gap: Supabase Auth
  only honors the app's `emailRedirectTo` (`<domain>/auth/callback`) if
  that URL is listed under the Supabase project's Redirect URLs;
  otherwise it silently falls back to the project's Site URL, and if that
  still points at `localhost` or an old domain (or has no path at all), a
  magic-link click lands on `/` — a static page that ignores any leftover
  query string — with no session ever established. Documented in the
  README's `## Deploying` section as a required step whenever the
  production domain changes. Confirmed a specific instance of this in
  production: the site was reachable at both the bare domain and its
  `www` subdomain, but only the bare domain was in Redirect URLs — a
  visitor on `www` requests a different origin than the allowlisted one,
  so it still fell back to Site URL. Documented that case too, with the
  fix (add both, or pick one canonical domain and redirect the other).
- **Storefront QR code (and email/redirect links) could hit a Vercel login
  page instead of the real page**: `siteUrl()` (`lib/email.ts`), the one
  function every absolute link in the app is built from — the org
  marketing toolkit's QR codes/copyable links, every transactional email,
  and a couple of auth redirects — fell back to Vercel's `VERCEL_URL` when
  `NEXT_PUBLIC_SITE_URL` wasn't set. `VERCEL_URL` is the *current
  deployment's own unique URL* (e.g. `easybookfair-abc123.vercel.app`),
  which Vercel's Deployment Protection commonly puts behind a login wall
  even in production — so a QR code built from it sent buyers to a Vercel
  login page instead of the storefront. Fixed by checking
  `VERCEL_PROJECT_PRODUCTION_URL` (Vercel's stable production domain
  alias, not behind that wall) before falling back to `VERCEL_URL`.
  `.env.example` and the README's deploy section now also call out
  setting `NEXT_PUBLIC_SITE_URL` explicitly once a real domain exists.
- **Event requests silently vanished after submitting**: `event_requests`
  (migration `0049`) only had a *composite* foreign key,
  `(fair_id, catalog_item_id) → allocations`, deliberately, to enforce
  "this book is allocated to this fair" — but Supabase's embedded-select
  syntax (`.select("...catalog_items(title)")`, used on both `/org`'s
  Event requests table and `/admin/event-requests`) resolves relationships
  from single-column foreign keys, and finds no path from
  `event_requests.catalog_item_id` straight to `catalog_items` on its own.
  Both reads failed (and, since neither checked the returned `error`,
  failed silently), so a request that inserted successfully never showed
  up anywhere — indistinguishable from "not recorded" to an org submitting
  one, even though the row existed in the database the whole time. Fixed
  by migration `0050`, which adds the missing direct
  `catalog_item_id → catalog_items(id)` foreign key alongside the existing
  composite one — they enforce different things and don't conflict.
- **Marketing flyer printed the org portal's nav bar and banners**:
  `app/org/layout.tsx`'s persistent nav, "view as" banner, and onboarding
  tour had no `print:hidden`, so printing the flyer from
  `/org/fairs/<id>/marketing` (or saving it as a PDF) included the whole
  portal chrome around it, not just the flyer. Added `print:hidden` to all
  three.
- **Promotion "Ends" date silently disabled the discount all day, every
  day, instead of at end of day**: `promotions.starts_at`/`ends_at` are
  `timestamptz`, but the promotion form only lets you pick a date (no
  time) — the value it submits is stored as midnight at the *start* of
  that calendar day. Every checkout path (guest, in-person, wallet, cash,
  and the checkout screen's own preview) filtered with `ends_at >= now`,
  so the instant any time passed midnight on the chosen end date, that
  comparison went false — the promotion looked "active" in the list but
  never actually matched anything for the rest of that day. A promotion
  with no end date, or one ending in the future, was unaffected; one
  ending on today's date (the most common case, since that's usually the
  fair's own last day) silently never applied. Fixed by adding
  `isPromotionInWindow()` (`lib/promotions.ts`), which compares calendar
  dates instead of full timestamps — an end date is now inclusive through
  23:59:59 of that day — and replaced the five copies of the old inline
  filter with it.
- **Admin checkout screen never previewed promotions**: active promotions
  were always applied correctly to the actual charge (reader, wallet, and
  cash all compute `applyPromotions()` server-side before recording the
  sale), but `CheckoutClient.tsx`'s cart list and "Total" always summed
  plain `catalog_items.price` — a cashier had no way to see a discount was
  live until after charging. The screen now fetches the same active,
  in-window promotions and runs the same `applyPromotions()` call to
  preview the real discounted total and tag discounted lines (🏷️) before
  the button is even clicked.
- **Public storefront never previewed promotions either** — the same bug,
  one screen over: `createGuestCheckout()` (`app/fairs/[fairId]/actions.ts`)
  already computed the real discounted total server-side before creating
  the PaymentIntent, but `StorefrontClient.tsx`'s cart list and "Total"
  summed plain catalog price the whole time a buyer was shopping, so what
  they saw while browsing didn't match what they were actually about to
  pay. Fixed the same way as the checkout screen: fetch active,
  in-window promotions in `page.tsx`, pass them down, and run the same
  `applyPromotions()` call to preview the real total and tag discounted
  lines before checkout.

### Added

- **Author phone number, and linking a book to an author** (migration
  `0051`): closes two gaps found while reviewing the event-request
  feature. Email was the only contact channel anywhere in the schema for
  an author — `authors`/`author_submissions` now also have `phone`
  (optional field on `/author/submit`, carried through
  `approveAuthorSubmission`'s `authors` upsert, shown on
  `/admin/author-submissions`). Separately, a book an admin added
  directly (never through `/author/submit`) had *no* author info at all —
  `catalog_items` had no author columns and no FK to `authors`, so
  `/admin/event-requests` could only ever show "No author on file" for
  it, even though an org can still submit an event request for that book.
  Fixed with three new optional columns directly on `catalog_items`
  (`author_name`/`author_email`/`author_phone` — plain fields, not a FK,
  since the point is covering a book whose "author" may have no account
  in the system at all), editable from the catalog item's create/edit
  forms. The event-requests review screen now prefers a matching approved
  `author_submissions` row (a real author with a portal account) and
  falls back to the book's own contact fields, only showing "No author on
  file" when both are empty. Confirmed safe to add to `catalog_items`:
  the public storefront never reads it directly (it goes through
  `fair_storefront_items()`, a SECURITY DEFINER RPC with a fixed return
  shape) and the existing `catalog_items_select_authenticated` RLS policy
  already exposes every column, including `cost`, to any authenticated
  user — the same tradeoff this schema already accepts.
- **Org dashboard marketing toolkit** (`/org/fairs/<id>/marketing`): a
  per-fair page with the storefront/student-wallet links (copy-to-clipboard
  buttons), a QR code for each (new `qrcode` dependency, rendered as a
  `data:` URL — no external service call), a printable one-page flyer
  (fair name/dates, an encouraging "every purchase supports [fair name]"
  tagline, cover images of up to 8 allocated books, a QR code, storefront
  URL) using the browser's own print-to-PDF, and ready-to-copy
  social-media/parent-email text templated from the fair's real
  name/dates/links — no invented pricing or claims. The flyer needed its
  own route rather than an inline dashboard section,
  same reasoning as the existing wallet donation receipt page: `window.
  print()` should print only the flyer, not the whole dashboard. Promoted
  the receipt page's `PrintButton` into `components/ui` since it now has a
  second caller, and added a new shared `CopyButton`. Linked from `/org`'s
  existing "Share with buyers" column.
- **Author reading / book signing requests** (`event_requests`, migration
  `0049`): an org can request an author event for a book already allocated
  to one of their own fairs, from a new `/org/events/request` form (fair
  picker → book picker, the book list scoped to that fair's `allocations`
  so an org can't request an event for a book it isn't actually carrying).
  Mirrors the `fair_requests` staging-table pattern exactly — org proposes,
  admin reviews at `/admin/event-requests` (approve/decline, no
  authenticated update policy), best-effort approval email to the org.
  The `(fair_id, catalog_item_id)` pair is enforced by a composite foreign
  key straight to `allocations`, so "this book isn't actually at this
  fair" is a database-level rejection, not just a client-side filter. The
  admin review screen also reverse-looks-up the submitting author (via
  `author_submissions.catalog_item_id`) so an admin knows who to actually
  coordinate the event with — the author is never auto-emailed, that's a
  manual step for the admin. Org staff already had read access to
  `allocations` for their own fairs (`allocations_select`, migration
  `0005`) — no new RLS needed there.
- **Real landing page at `/`**: replaced the placeholder root page with a
  fundraising-focused landing page — hero, "How it works" (4 steps),
  feature highlights, "Who it's for" (schools/orgs, authors/vendors,
  already-set-up staff), and an FAQ — linking out to `/join`,
  `/author/submit`, and `/login`. Positions EasyBookFair as a fundraiser
  for the organization first, with the platform's actual features (four
  payment options, student wallets, live sales feed, automatic payout,
  org-run checkout) as the supporting detail, rather than leading with the
  software itself. Designed as a mockup first (Claude's design skill) and
  iterated on before being ported into `app/page.tsx`, so its copy stays
  accurate to what's actually built rather than aspirational.
- **Author submissions: required front cover, back cover, and interior
  PDF** (migrations `0047`/`0048`): the public submission form
  (`/author/submit`) now collects a front cover image, a back cover image,
  and a PDF of the interior for admin review, alongside the existing
  title/description/price fields — all three are **required**, enforced
  both by the form and, since `0048`, by `NOT NULL` on the columns
  themselves (the same pattern as every other required field on this
  table), so a submission can't skip them even via a direct API call.
  Still uploaded before the author has any account, into the same
  `author-submissions` storage bucket. `author_submissions.image_url` is
  renamed to `front_cover_image_url` for clarity (still the field copied
  to `catalog_items.image_url` on approval) and gains
  `back_cover_image_url`/`interior_pdf_url`. The admin review screen
  (`/admin/author-submissions`) shows both cover thumbnails and a link to
  the interior PDF alongside each pending submission.
- **Live sales feed** (`/admin/fairs/<id>/sales`, `/org/fairs/<id>/sales`):
  every completed sale for a fair — item title, channel, price, time —
  itemized and refreshing automatically, plus a running units-sold/
  revenue total. Built on polling (`getRecentSales()`, called every few
  seconds), not a Supabase Realtime subscription — no new infrastructure
  dependency, and comfortably responsive at book-fair transaction
  volumes. Diffs the polled batch by row id rather than cursoring on
  `sold_at`, since `record_cash_sale()`/`spend_from_wallet()` insert one
  row per unit in a tight loop and two sales can land with the identical
  timestamp (confirmed while testing this). No new schema or RLS was
  needed — `sales_select` (migration `0005`) already scoped reads
  correctly for both an admin and that fair's own org staff. The feed
  also shows a live **payout estimate** — `close_fair()`'s own formula
  (migration `0036`), read straight from `journal_entries`/
  `journal_lines` instead of waiting for the fair to close, and verified
  to match `settlements.net_payout` exactly when the fair is actually
  closed right after. Once a `settlements` row exists, the feed switches
  to showing that locked-in figure, labeled "Final payout" instead of an
  estimate.
- **Org staff can run their own fair day-of** (migration `0046`):
  checkout, pickup, and wallets were effectively admin-only — not just the
  UI (`requireAdmin()`), but the underlying RPCs
  (`record_cash_sale`/`spend_from_wallet`/`mark_checkout_picked_up`/
  `close_wallets_for_fair`) hard-gated to `app.is_platform_admin()`
  internally. A new `app.can_operate_fair(p_fair_id)` generalizes that
  check (true for any admin, or for org staff whose org owns that
  specific fair — the same org-scoping `fairs_select`/`sales_select`
  already use), and `requireFairStaff()` (`lib/auth.ts`) is the matching
  page/action-level gate. New `/org/fairs/<id>/{checkout,pickup,wallets}`
  mirror the admin screens exactly (same `CheckoutClient`, same Server
  Actions) for org staff, and the org dashboard's fairs table gained a
  **Run this fair** column linking to whichever apply. `student_wallets`/
  `wallet_fundings` also gained additive org-scoped `SELECT` policies
  (previously admin-only), the same pattern as `sales_select_author`
  being additive to `sales_select`.
- **Promotion editing**: promotions could only be created, toggled
  active/inactive, or deleted — never edited. `PromotionForm` now accepts
  optional `initial` values and a new `updatePromotion()` action; each
  promotion card has an **Edit** button that reopens the same form,
  prefilled, in place.
- **Organization signups** (`/join`, public, no login; migration `0045`,
  `org_signups` table): the organization-side counterpart to author
  submissions — before this, an organization could only ever be created
  directly by an admin (`app/admin/organizations/actions.ts`), with no
  self-serve path in at all, unlike authors. A school or org now submits
  name/contact/is-school/message with no account, an admin reviews it at
  `/admin/org-signups`, and approving creates the real `organizations`
  row, invites the contact by email (Supabase's own invite flow, same
  mechanism as author-submission approval), and adds them as org staff
  (`org_members`) in one step — they can sign in to `/org` immediately.
  Deliberately placed at `/join`, not under `/org`, since the middleware
  gates every `/org/*` path behind an existing session. The root landing
  page (`/`, previously a stale Phase 1 placeholder) now actually links to
  this, to `/author/submit`, and to `/login`.
- **Cash tender on the admin checkout screen** (migration `0043`,
  `record_cash_sale()`): cash has been a real `sale_channel` since Phase 1
  (`record_sale()` already had a dedicated ledger-posting branch for it),
  but there was never any UI to actually record one. A "Charge $X in cash"
  button now sits alongside the reader/wallet options on
  `/admin/fairs/<id>/checkout` — admin-gated, re-checks `allow_cash` and
  availability the same way every other checkout path does, and settles
  synchronously with no PaymentIntent or webhook involved.
- **Demo fair admin lockdown** (migration `0044`): the demo fair's public
  storefront/wallet pages (`/fairs/<id>`, `/fairs/<id>/wallet`) now only
  render for a signed-in platform admin, and a new **Enable/Disable demo
  fair** toggle on `/admin/demo` can turn them off entirely (admin
  included) via a new `organizations.is_demo_enabled` column. Toggling it
  shows a confirmation naming whether Stripe is currently in test or live
  mode (`stripeMode()`, `lib/stripe.ts`, read from the configured secret
  key's own prefix), so an admin isn't surprised by real-money risk before
  flipping it on. Enforced both on the page (`isPlatformAdmin()`,
  `lib/auth.ts`) and inside the underlying Server Actions
  (`createGuestCheckout`, `createWalletFunding`), not just the UI.
- **Settlement reconciliation** (migration `0042`): the payout/payment-
  link buttons below previously recorded only that an attempt was made
  — now they confirm the outcome. `settlements` gained
  `transfer_confirmed_at`, `transfer_reversed_at`, and
  `payment_link_paid_at`. The two payment methods are reconciled
  differently because Stripe itself treats them differently: a Transfer
  moves funds between the platform's and a connected account's *Stripe
  balance*, which is synchronous with the API call succeeding (no
  separate pending state the way a bank Payout has), so
  `sendSettlementPayout()` sets `transfer_confirmed_at` itself right
  after creating it — no webhook involved for the happy path.
  `transfer_reversed_at` catches the one way a confirmed transfer can
  still un-happen later (a dispute clawback), via a new
  `transfer.reversed` webhook case. A Payment Link is genuinely
  asynchronous — the org has to actually pay — so
  `payment_link_paid_at` can only ever be set by a new
  `checkout.session.completed` webhook case, matched by `session.
  payment_link` against `stripe_payment_link_id` (Payment Link metadata
  doesn't propagate to its Checkout Session the way
  `payment_intent_data.metadata` propagates to a PaymentIntent, so
  matching by id was simpler and just as reliable). That same
  PaymentIntent also still triggers the existing `payment_intent.
  succeeded` handler harmlessly — its `metadata.kind` matches neither
  branch there, and `record_checkout_sale()` already no-ops on a
  `payment_intent_id` with no matching `checkout_sessions` row. A new
  `sendSettlementCollectedEmail` (`lib/email.ts`) fires once a payment
  link is paid. The fair edit page's Settlement card and the org
  dashboard's Payout column both now show the reconciled state — "✅
  Payout confirmed" / "⚠️ Transfer was reversed" / "⏳ Awaiting payment"
  / "✅ Paid on \<date\>" — instead of just the raw transfer/link id.
  - Validated: `npm run typecheck`/`npm run build` both clean; the new
    webhook cases follow the exact structure of the existing
    `payment_intent.succeeded`/`account.updated` handlers (service-role
    client, `webhook_events` dedup already covers all event types, not
    just the two that existed before). Not exercised against a live
    Stripe webhook delivery (would need a real Payment Link paid
    end-to-end) — same reasoning as every other Stripe-touching batch
    this session.
- **Settlement payouts and payment links**
  (`app/admin/fairs/actions.ts`): closing a fair (`close_fair()`,
  migration `0036`) previously stopped at recording the settlement — the
  fair's edit page now has real buttons for the "move the money" step.
  **Send payout** (shown when `net_payout > 0`) fires a Stripe Transfer
  to the org's connected Express account, guarded on their Connect
  onboarding actually being done (`stripe_connect_account_id`/
  `stripe_payouts_enabled`) and disabled once already sent. **Create
  payment link** (shown when `net_payout < 0`) creates a one-time Stripe
  Payment Link for the amount owed and emails it to the org's
  `contact_email`; Payment Links need an actual `Price` object, unlike a
  Checkout Session's inline `price_data`, so this calls
  `stripe.prices.create()` with `product_data` to mint a one-off price
  on the fly (the amount differs per settlement). Both write into
  `settlements.stripe_transfer_id`/`stripe_payment_link_id` — columns
  that existed since Phase 1's original `settlements` table (migration
  `0003`) with nothing ever writing to them until now, so no new
  migration was needed. Neither button confirms the money actually
  arrived — they record that the attempt was made, not its outcome; a
  human still checks Stripe's own dashboard for that, and there's no
  webhook-driven reconciliation. Best-effort confirmation emails
  (`sendSettlementPayoutEmail`/`sendSettlementPaymentLinkEmail`,
  `lib/email.ts`) fire after each.
  - Validated: `npm run typecheck`/`npm run build` both clean. Not
    exercised against live Stripe (no test-mode Connect account/balance
    set up in this environment) — same reasoning as every other
    Stripe-touching batch this session.
- **Admin "view as" an org or author** (migration `0041`, `lib/viewAs.ts`):
  a "View as" link on each row of `/admin/organizations`/`/admin/authors`
  (new page) switches an admin's session into that org's `/org` or that
  author's `/author` portal — an amber banner (shown on `/org`/`/author`,
  and on `/admin` itself if still active there) makes it unmistakable,
  with "Stop viewing as" to switch back. Deliberately **not** a real
  session swap — an httpOnly cookie is just a routing signal,
  re-verified against `app.is_platform_admin()` on the caller's own real
  session every time it's read (`requireOrgStaff()`/`requireAuthor()`),
  never trusted by itself. Two write-side consequences: (1) `/org`/
  `/author` pages that previously relied on RLS to auto-scope a genuine
  member's session now filter explicitly by the id `requireOrgStaff()`/
  `requireAuthor()` returns — an admin's own RLS access already sees
  every org/author's rows, so without an explicit filter they'd see
  everyone's data mixed together instead of just the one being
  previewed. (2) New unconditional admin insert policies
  (`fair_requests_admin_insert`/`author_submissions_admin_insert`) let an
  admin write a row attributed to an org/author they aren't themselves,
  which the existing insert policies (checking the row against the
  caller's own `auth.uid()`) can't allow — so it's the application code,
  not RLS, responsible for setting `org_id`/`author_user_id` to the
  correct impersonated target; `submitAuthorSubmission` stopped trusting
  a client-supplied `author_user_id` once that policy existed, deriving
  it server-side from the view-as cookie (or the caller's own `authors`
  row) instead. Every such write gets a new `submitted_by_admin_id`
  (both `fair_requests` and `author_submissions`) recording who actually
  clicked submit — `org_id`/`author_user_id` stay pointed at the real
  target, so the row behaves identically everywhere else, but
  `/admin/fair-requests`/`/admin/author-submissions` flag it inline so
  it's never mistaken for the org/author's own submission. An admin
  submitting a fair request while viewing as an org sends the approval
  email to that org's own `contact_email` (falling back to the admin's
  if unset) rather than to the admin's own inbox.
  - Validated against a real local Postgres instance: an admin can insert
    a `fair_requests`/`author_submissions` row for an org/author they are
    not themselves a member/owner of (the new admin policies), a regular
    org member's own normal submission still works unaffected, and a
    non-admin, non-matching user is still rejected attempting the same
    thing an admin can do. `npm run typecheck`/`npm run build` both
    clean.
- **Promotions, a scoped-down fair-close settlement, author submissions,
  an onboarding tour, and a demo fair** (migrations `0033`–`0040`) — a
  large batch pulling several later-phase pieces forward at once:
  - **Fair URLs visible to admins too** (not just the org): the fairs
    list and a fair's edit page now show the same storefront/wallet
    links the org portal already displayed.
  - **Fair-approval email**: `fair_requests` gained `requested_by_email`
    (migration `0033`, captured at submit time from the session, since a
    Server Action has no browser session to look it up from later).
    Approving now emails that address a link straight to `/org` —
    `lib/email.ts` gained `sendFairApprovedEmail()` and a `siteUrl()`
    helper (falls back to Vercel's `VERCEL_URL`, then localhost;
    `NEXT_PUBLIC_SITE_URL` overrides) for building absolute links from
    server-only code that has no `window.location`.
  - **Onboarding tour** (`components/Tour.tsx`): a small floating
    step-through card, auto-shown once per browser (`localStorage`) in
    both `/admin` and `/org`, and reachable afterward from a persistent
    "🎓 Take the tour" nav link that reopens it regardless of the stored
    flag — deliberately not tied to the three specific trigger events
    from the original ask (fair approval, being added as staff, first
    login), since all three collapse to "the first time this person
    lands on their dashboard" in practice.
  - **Demo/training fair** (migration `0035`): a seeded, permanent
    `organizations.is_demo` org with a fair and five `[Demo]`-prefixed
    catalog items already allocated to it. `reset_demo_fair()` (admin-
    gated) clears every sale/checkout/wallet/settlement made against it
    and restores stock/allocation to a fixed starting point — a new
    `/admin/demo` page surfaces the fair's own admin links plus a "Reset
    demo data" button.
  - **Equipment rental fee + `close_fair()`** (migrations `0034`,
    `0036`): `fairs` gained `equipment_rental_fee` (admin-set at approval
    or later, only meaningful with the in-person reader on). `close_fair()`
    is a real, if deliberately scoped-down, settlement: `payout_due`/
    `cash_wholesale_owed` are read straight off the ledger (the net
    balance of Org Payable `2000`/A/R `1300` for that fair, which already
    nets in refunds and wallet close-out credits automatically), netted
    against the rental fee into `net_payout`; `missing_inventory_cost` is
    hardcoded `0` since there's no returns-recording feature to compute
    it from yet. `settlements` gained a matching `equipment_rental_fee`
    column, folded into its `total_owed_by_org` check constraint (had to
    `drop constraint`/re-add — Postgres names unnamed multi-column table
    checks `<table>_check`, `<table>_check1`, not by column). New
    "Settlement" card on the fair's edit page (a "Close this fair" button
    before close, the computed figures after); the org dashboard's fairs
    table gained a "Payout" column reading the same `settlements` row
    (already org-scoped by existing RLS).
  - **Wallet close-out donation notice** (migration `0037`):
    `student_wallets` gained `donated_amount`/`closed_at`, set by
    `close_wallets_for_fair()` when it zeroes a wallet's balance — needed
    since the balance itself doesn't survive close-out. A new anon-safe
    `wallet_donation_receipt()` RPC (only ever returns a closed wallet
    with something actually donated) backs a printable
    `/fairs/<id>/wallet/receipt/<walletId>` page (a plain "print/save as
    PDF" button — no PDF-generation library, same posture as everywhere
    else in this app). Closing a fair's wallets now emails each parent
    with unspent balance (found via their most recent `wallet_fundings.
    parent_email`) a link to it.
  - **Promotions/bundle discounts** (migrations `0038`–`0039`):
    `promotions` gained `fair_id` (previously unused, platform-wide, no
    checkout path read it at all). `lib/promotions.ts`'s
    `applyPromotions()` is pure and framework-free, shared by all three
    checkout paths rather than reimplemented per path or in SQL — bundle
    promotions resolve first (against a richest-item-first pool, so the
    buyer gets the best deal), then percent discounts against whatever's
    left, then anything unclaimed at full price; a promotion can split
    one cart line into more than one output line since
    `checkout_sessions.line_items`/`record_sale()` already snapshot one
    price per line. `spend_from_wallet()` now accepts an explicit
    `price_charged`/`promotion_id` per line (falling back to the catalog
    price when omitted) instead of always pricing from `catalog_items`
    itself. New `/admin/fairs/<id>/promotions` CRUD screen (percent-off
    or bundle, with an item-eligibility checklist drawn from that fair's
    allocations).
  - **Author submissions** (migration `0040`): a public, no-login
    `/author/submit` form (title, description, category, image,
    suggested retail price — `wholesale_price` is a **generated column**,
    `round(suggested_retail_price * 0.65, 2)`, so it can never be
    submitted or edited independently of retail price). `author_
    submissions`/`authors` mirror the `fair_requests`/`fairs` review
    pattern — no update policy for `authenticated`, only an admin can
    move `status`. Approving (`/admin/author-submissions`) invites the
    author to a real Supabase auth account (falling back to finding an
    existing one via `admin.listUsers()` if the email's already
    registered — supabase-js has no direct `getUserByEmail`), creates the
    catalog item, and links both back to the submission. A minimal
    author portal (`requireAuthor()`, `/author`) lists submission status
    and — once approved and selling — units sold/revenue, via an
    additive `sales_select_author` RLS policy (Postgres OR's multiple
    permissive policies together; doesn't touch `sales_select`'s existing
    org/admin scoping). A new `author-submissions` storage bucket
    (public read, anon/authenticated insert, admin-only update/delete)
    holds submission images.
  - Validated against a real local Postgres instance (fresh `0001`–`0040`
    chain): `close_fair()` correctly nets a mixed cash+card+rental-fee
    fair to the right `net_payout` (verified both signs — org owed and
    org owing), clears Org Payable to zero either way, rejects a
    non-admin caller and a second close; `close_wallets_for_fair()`
    correctly snapshots `donated_amount`/`closed_at` and
    `wallet_donation_receipt()` only ever returns a wallet with something
    actually donated; `spend_from_wallet()` honors an explicit
    `price_charged`/`promotion_id` and falls back to catalog price when
    omitted; `author_submissions` RLS rejects an anonymous self-link
    attempt, scopes an author to only their own rows, and the additive
    `sales_select_author` policy correctly scopes sales visibility per
    author. `lib/promotions.ts` also has its own standalone test script
    (five scenarios — no promotions, a bundle consuming the richest
    items first with a leftover at full price, a percent promotion below
    and at its minimum quantity, and a bundle remainder smaller than its
    own buy-quantity) run via `npx tsx`, independent of the database.
    `npm run typecheck`/`npm run build` both clean. Not validated in a
    live browser against real data — same reasoning as prior batches'
    entries (this environment's `.env.local` points at the user's real
    Supabase project).
  - **Explicitly still not built**, called out in README/MANUAL rather
    than silently missing: missing-inventory cost as part of closing a
    fair, and automating the actual money movement (Stripe Transfer or
    Payment Link) once a fair is closed — both need a real
    returns-recording feature this batch doesn't build.
- **Org staff portal + fair-request workflow** (migrations `0029`–`0032`):
  an org now requests a fair instead of an admin creating one directly,
  choosing which buyer payment options it wants — each explained before
  they choose, not just a bare checkbox.
  - **Payment-option flags** (migration `0029`): `fairs` gained
    `allow_online`/`allow_wallet`/`allow_in_person`/`allow_cash` booleans
    (defaults matching today's behavior — online/in-person/cash on,
    wallet off). `allow_cash` is captured but not enforced anywhere yet —
    there's no cash-sale-recording UI in the app at all, only DB-level
    support left over from Phase 1.
  - **`fair_requests` table** (migration `0030`): a separate staging
    table rather than a status on `fairs` itself, reusing the existing
    `public.application_status` enum instead of a new one. RLS lets an
    org member insert a request for their own org
    (`org_id in app.current_org_ids()`, `requested_by = auth.uid()`) but
    has **no update policy for `authenticated`** — only a platform admin
    can move a request to `approved`/`declined`, so an org can't
    self-approve.
  - **`requireOrgStaff()`** (`lib/auth.ts`): mirrors `requireAdmin()` —
    checks `org_members` for the signed-in user and redirects to
    `/unauthorized` if there's no membership row, returning the caller's
    `orgIds` (a person can belong to more than one org). `middleware.ts`
    now also gates `/org/:path*`.
  - **Org portal** (`/org`, new): a dashboard listing the org's fairs
    (with shareable storefront/wallet links, shown only when the
    corresponding option is enabled) and its fair requests with status;
    `/org/fairs/request` is the request form itself, with the payment
    checkboxes and their explanations described above.
    `app/org/actions.ts`'s `createFairRequest` validates the submitted
    `org_id` is one of the caller's own before inserting.
  - **Admin review** (`/admin/fair-requests`, new): lists all requests
    with the org name and requested payment options; **Approve** creates
    the real `fairs` row copying the requested dates and payment flags
    and links `fair_requests.fair_id` to it; **Decline** takes an
    optional note shown back to the org. Both are only offered while a
    request is still `pending`.
  - **Enforcement, not just a hidden checkbox** — updated to defense in
    depth wherever the corresponding surface is anon/public-facing:
    - `fair_public_info` (migration `0031`, required a `drop function`
      first since `CREATE OR REPLACE` can't add OUT columns — grants
      reapplied after) now also returns the three buyer-visible flags;
      `/fairs/<id>` uses them to gate the storefront body, the wallet
      link, and the "Find my order" link.
    - `fair_storefront_items` (migration `0032`) now joins `fairs` and
      filters on `allow_online = true` itself, so even a direct RPC call
      against a disabled fair returns nothing.
    - `createGuestCheckout` and `createWalletFunding` (server actions)
      both re-check `allow_online`/`allow_wallet` before writing, so a
      disabled channel is rejected even if called directly, not just
      hidden in the UI.
    - The admin in-person checkout screen only wires up Terminal (
      `terminalLocationId`) when `allow_in_person` is set, and only
      renders the wallet-charge section of `CheckoutClient` when
      `allowWallet` is true; the fair's edit page grew a "Payment
      options" fieldset (all four checkboxes) so an admin can adjust them
      after approval.
  - Validated against a real local Postgres instance (fresh `0001`–`0032`
    chain, plus a targeted script): a cross-org `fair_requests` insert is
    rejected by RLS; an org member's own attempt to approve their request
    is silently filtered (not an error) and leaves it `pending`; an
    admin's approval correctly copies the requested flags onto the new
    `fairs` row; `fair_storefront_items` returns the fair's items while
    `allow_online` is true and returns nothing once it's flipped off.
    `npm run typecheck`/`npm run build` both clean. Not validated in a
    live browser against real data — same reasoning as the prior batch's
    entry below (this environment's `.env.local` points at the user's
    real Supabase project).
  - **Explicitly deferred, not started** (sized during this batch's
    planning but out of scope for it): a software onboarding tour (on
    fair approval, on being added as org staff, or on org login), a
    demo/training fair, a donation-notice receipt for a parent when a
    closed fair's unused wallet balance becomes the org's, and an author
    submission flow (public form with a suggested-retail-price input
    auto-calculating a 65% wholesale cost, admin review, and an author
    account created on approval).
- **Buyer-facing polish pass** on top of the four payment options below —
  migrations `0026`–`0028`:
  - **Fixed a real gap, not just cosmetics**: `checkout_sessions.line_items`
    never carried each item's `title`, only `catalog_item_id`/`quantity`/
    prices — so the order confirmation page literally rendered the
    placeholder text "1× item", and the admin pickup screen could only
    show a total count, with no way to know *which* books to hand over.
    Both `createGuestCheckout` and `createInPersonCheckout` now snapshot
    `title` into the line item alongside price/cost; both screens render
    it.
  - **Storefront redesign**: a responsive card grid with cover thumbnails
    (`image_url`, falling back to a placeholder icon) replaces the old
    plain table, plus client-side search, a category filter, and a sort
    order (title / price) — all computed from the page's own loaded item
    list, no extra round-trip. `fair_storefront_items` (migration `0024`)
    now also returns `category` (migration `0026`; changing a `returns
    table(...)` function's columns needs `drop function` before `create or
    replace` — `CREATE OR REPLACE` alone can't change the OUT parameter
    list, and the DROP takes its grants with it, so they're reapplied
    after). A "↻ Refresh availability" button (`router.refresh()`) covers
    the case where the displayed count goes stale.
  - **Order recovery** (`/fairs/<id>/orders`): a buyer who loses their
    order code/confirmation can look past online orders back up by the
    email they gave at checkout — `get_checkout_sessions_by_email`
    (migration `0027`), scoped to that fair's `online` channel only.
    Documented tradeoff: this is keyed on an unverified email, not a
    login — anyone who knows/guesses it can see the order (low-stakes
    data: what was ordered, pickup status), same trust level already
    accepted for the single-order lookup-by-unguessable-id page.
  - **Wallet funding amount presets** ($10/$20/$50 quick buttons alongside
    the custom-amount field).
  - **Confirmation emails via Resend** (`lib/resend.ts`, `lib/email.ts`):
    sent from the payment webhook after `record_checkout_sale` (online
    orders only — in-person buyers are standing right there) and after
    `record_wallet_funding` complete, using the same `kind`-tag branch
    already added for those two RPCs. Wired as strictly best-effort — each
    send is wrapped in try/catch and only logged on failure, since the
    underlying payment has already committed by the time the email is
    attempted and must never be retried by failing the webhook response.
    `wallet_fundings` gained a `parent_email` column (migration `0028`) to
    have something to send to; `checkout_sessions.buyer_email` already
    existed. New required env vars: `RESEND_API_KEY`, `EMAIL_FROM`.
  - Validated against a real local Postgres instance:
    `fair_storefront_items` returns `category`; `get_checkout_sessions_by_
    email` matches case-insensitively and correctly excludes a different
    fair's order and an in-person order. Not validated in a live browser
    against real data — the `.env.local` present in this environment
    points at the user's actual Supabase project, which hadn't had this
    batch's migrations applied yet, and connecting to real infrastructure
    to test wasn't something to do unprompted; `npm run build`/
    `typecheck` and the SQL tests above are what actually ran.
- **Four buyer payment options, all writing through the same ledger core**
  (migrations `0015`–`0025`): online storefront with fair pickup, a
  parent-funded student wallet, plus the existing in-person reader and
  cash paths — pulling most of Phase 4 forward alongside Phase 3.
  - **Online storefront** (`/fairs/<id>`, public, no login): browse a
    fair's available-to-sell stock and check out as a guest with Stripe
    Elements. `createGuestCheckout` (`app/fairs/[fairId]/actions.ts`)
    snapshots price/cost server-side and re-validates availability, same
    as the admin in-person checkout action. Orders are for pickup, not
    shipping — `checkout_sessions` gained `buyer_name`, `buyer_email`,
    and `fulfillment_status` (migration `0023`); `record_checkout_sale`
    now sets `fulfillment_status = 'awaiting_pickup'` for online orders
    the moment payment clears. No confirmation email is sent (no
    transactional email service configured) — the order confirmation
    page (`/fairs/<id>/order/<id>`, reachable by the session's own
    unguessable id, no buyer login to check against) is the buyer's only
    record.
  - **Order pickup** (`/admin/fairs/<id>/pickup`): search online orders by
    buyer name/email, mark them picked up (`mark_checkout_picked_up`,
    admin-gated RPC rather than an RLS update grant, keeping
    `checkout_sessions`' service-role/RPC-only write boundary intact).
  - **Student wallets** (schools only — `organizations.is_school`,
    migration `0015`, a checkbox on the org edit page): a parent loads
    money onto a named student's balance at `/fairs/<id>/wallet` (public);
    the student spends it down themselves at
    `/admin/fairs/<id>/checkout` (a new wallet-search section in
    `CheckoutClient`) by name — no login for either party, a plain
    name/grade/teacher lookup mirroring how Scholastic's own eWallet
    identifies students at the register. New pieces: `student_wallets`
    and `wallet_fundings` tables, a `wallet` value on `sale_channel`
    (migration `0016`, added in its own migration since Postgres won't
    let a new enum value be used in the same transaction that added it),
    a `Buyer Wallet Liability` ledger account (`1400`, migration `0017`),
    `record_wallet_funding()` (mirrors `record_checkout_sale`'s
    idempotency pattern), and `spend_from_wallet()` (re-validates
    availability, writes one `record_sale()` call per unit, and leans on
    `student_wallets`' own `check (balance >= 0)` constraint for overdraft
    protection instead of a separate application-level check — a failed
    overdraft aborts the whole call, rolling back every sale already
    written in it). `record_sale()` (migration `0020`) now branches which
    account it debits by channel: Stripe Clearing for card/online (as
    before), the new wallet liability account for a wallet spend (the
    cash already arrived at funding time, so a wallet sale only relieves
    that liability rather than debiting Stripe Clearing again). Unused
    balance does **not** refund or roll over to the student's next fair —
    per explicit product decision, `close_wallets_for_fair()`
    (`/admin/fairs/<id>/wallets`, migration `0022`) sweeps it into that
    fair's org payout instead, a manual, irreversible admin action.
  - The payment webhook now tells apart a cart checkout from a wallet
    funding via a `kind` tag (`checkout_session` / `wallet_funding`) set
    in each PaymentIntent's metadata at creation time, dispatching to
    `record_checkout_sale` or `record_wallet_funding` accordingly.
  - Two new anon-facing `SECURITY DEFINER` RPCs (`fair_storefront_items`,
    `fair_public_info`/`get_checkout_session_public`, migrations
    `0024`–`0025`) are the storefront/wallet pages' only route to
    buyer-safe data — `catalog_items`/`allocations`/`sales`/`fairs`/
    `organizations` still have no anon SELECT policy at all, keeping the
    existing default-deny RLS posture intact rather than opening those
    tables up.
  - New dependencies: `@stripe/stripe-js` + `@stripe/react-stripe-js`
    (Stripe Elements, for the two public payment pages — a separate
    integration from the admin checkout screen's Terminal SDK). New
    required env var: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
  - Known gap, same shape as the in-person checkout's: none of the three
    new availability/balance checks are row-locked the way
    `allocate_inventory` is — fine for normal single-station traffic, not
    safe against simultaneous checkouts racing for the last unit without
    added locking.
  - Validated against a real local Postgres instance: wallet funding
    (including idempotent redelivery), spending (including overdraft
    rejection via the balance check constraint, and availability
    rejection), close-out sweeping into Org Payable with a balanced
    ledger entry, and the pickup flow (`awaiting_pickup` on an online
    order, `null` on an in-person one, idempotent double-pickup, correct
    ledger balances on wallet sales). Also fixed a real, unrelated
    dependency issue surfaced while validating: `npm install` had floated
    an ESLint 9 upgrade that broke `npm run lint` against this project's
    old-style `.eslintrc.json` (needs the new flat-config format) — noted
    here since it's pre-existing and out of scope for this change, not
    fixed.
- **Manual & version in the admin dashboard** (`/admin/manual`, linked from
  the admin nav) — renders `docs/MANUAL.md` and `docs/CHANGELOG.md` as HTML
  (via `marked`) alongside the running app's version, read from
  `package.json` and also shown as a small badge in the admin nav header.
  No new styling dependency — a `.markdown-body` class in `globals.css`
  covers headings/lists/code/links since no Tailwind typography plugin was
  installed.
- **Editable restock orders** — a reserved restock row on the allocations
  page was previously a read-only summary; it's now an editable form
  (quantity, order date, expected arrival, status), so a wrong order date
  or a supplier-communicated delay can be corrected after the fact instead
  of only being settable at creation time via "Reorder now". No schema
  change — this only exercises the existing `restock_orders_admin_all` RLS
  policy that already covers updates, the same one `reserveRestock`'s
  insert already relied on.
- **Field labels above catalog form inputs** instead of placeholder text
  doubling as the label (which disappears once you start typing) — the
  add/edit catalog forms now use the shared `Field` component throughout,
  consistent with the fairs edit form. `Field`'s `label` prop is now typed
  as `ReactNode` rather than `string`, since the edit form's image field
  needs to show the current image thumbnail inline with its label.
- **In-person checkout with a physical Stripe Terminal reader**
  (`/admin/fairs/<id>/checkout`) — the first real caller of the
  `checkout_sessions`/`payment_intent.succeeded` webhook path built in
  Phase 3. Internet-connected readers only (BBPOS WisePOS E, Stripe
  Reader S700) — Bluetooth readers and Tap to Pay on iPhone/Android need
  Stripe's native mobile Terminal SDKs, which a browser can't invoke, so
  they're out of reach for this web app. Pieces added:
  - `fairs.stripe_terminal_location_id` (migration `0014`) — a Stripe
    Terminal Location per fair venue.
  - A "Terminal setup" card on the fair edit page: creates the Location,
    registers readers by registration code, lists registered readers with
    live online/offline status.
  - `/api/terminal/connection-token` — issues the short-lived connection
    token the Terminal JS SDK needs, admin-gated (401/403 JSON, not a
    redirect, since it's called from browser JS).
  - The checkout screen: builds a cart from a fair's available-to-sell
    stock (allocated minus already-completed sales), connects to a
    registered reader, and charges it. `createInPersonCheckout()` snapshots
    price/cost from `catalog_items` server-side (never trusts the client
    cart's prices), re-checks available-to-sell, creates the
    `checkout_sessions` row and a `card_present` PaymentIntent, and returns
    the client secret for the Terminal SDK's `collectPaymentMethod`/
    `processPayment` calls. The actual `sales`/ledger rows are still
    written asynchronously by the existing webhook once Stripe confirms
    payment — this just gives that path a live caller.
  - Known gap: unlike `allocate_inventory`, the available-to-sell check
    here isn't row-locked — two carts finishing at the same instant for
    the last unit of an item could both pass. Fine for one reader/one
    cashier at a time; would need real locking for multiple concurrent
    checkout stations.
  - Fixed a real, pre-existing type conflict surfaced while adding
    `@stripe/terminal-js`: it depends on an old `stripe@8.x` package
    purely for types, and that old package declares its types via ambient
    `declare module 'stripe'` blocks — which, once loaded anywhere in the
    program, silently overrode the real `stripe@22.x` types used
    everywhere else (`lib/stripe.ts`, the webhook, org onboarding),
    breaking `new Stripe(...)`'s expected arguments. Fixed via an npm
    `overrides` entry forcing that nested dependency to the same version
    already used at the top level, so there's only one `stripe` package
    (and one set of correctly-scoped types) in the whole tree.
  - `lib/stripe.ts` now pins `apiVersion` explicitly in the Stripe client
    config (the installed SDK's types now require it) rather than
    leaving it to the SDK's default, so a future unrelated `npm install`
    can't silently change which Stripe API version the app talks to.
- `restock_orders.ordered_at` (migration `0013`) — the date an order was
  actually placed with the supplier, separate from `created_at` (when the
  row was entered into the system). Previously `expected_arrival` was
  always computed as today + lead time at the moment "Reorder now" was
  clicked, which was wrong if the order was placed days earlier by phone
  and only logged later. The "Reorder now" form now has an "Ordered on"
  date field, defaulting to today but backdatable (capped at today —
  can't order in the future); `expected_arrival` is computed from that
  date, not from "now". Existing rows backfilled from `created_at`.
  Validated against a real local Postgres instance: a backdated
  `ordered_at` correctly shifts `expected_arrival`, and the default still
  falls back to today when omitted.
- `public.deallocate_inventory()` (migration `0012`) and a **Remove**
  field/button on the allocation page — allocate_inventory only ever
  added, with no way to correct an over-allocation. Mirrors it: locks
  the catalog/allocation rows, decrements the allocation, returns units
  to `stock_on_hand`, and posts the reverse ledger entry
  (Unallocated ← Consigned). Refuses to pull back units already sold —
  checks completed sales for the fair/item first and only allows
  removing up to the unsold remainder. Validated against a real local
  Postgres instance: admin-only, the reversal entry, rejecting removal
  beyond what's allocated, and rejecting removal beyond what's unsold
  once sales exist.
- Per-item dimensions (`length_in`/`width_in`/`height_in`, migration
  `0011`) on `catalog_items`, all optional/nullable. Added to the catalog
  add/edit forms and CSV bulk upload, grouped with weight/lead
  time/stock under a new "Packing & shipping" section with a description
  of what those fields drive.
- `lib/packCartons.ts` now packs by **weight and volume together**, not
  weight alone — a carton fills up on whichever limit it hits first,
  matching how a real box has both a weight rating and a physical size.
  An item missing one of the two measurements is packed by whichever it
  has (verified this doesn't get wrongly blocked by an irrelevant zero on
  the other axis); an item with neither still gets grouped into its own
  carton rather than dropped. `computePackingSuggestion` now runs the
  actual packing pass for every carton option and picks the one with the
  fewest resulting cartons, instead of a separate ceil-division estimate
  that could disagree with what the real packing list produced.
- Packing suggestion now assigns specific items to specific cartons
  ("Carton 1: 15× Title A, 10× Title B"), not just a box count. New
  `lib/packCartons.ts`: first-fit-decreasing bin packing by weight
  against the recommended carton size, unit-tested (fits-in-one-carton,
  overflow-splits-across-cartons, an item heavier than the whole carton
  still gets placed one-per-carton rather than looping forever, and an
  item with no weight set lands in its own carton rather than being
  silently dropped or mixed into weight-based placement). No schema
  change — the extra `cartons` array lives in the existing
  `packing_suggestions.suggestion` jsonb column alongside what was
  already there.

### Changed

- Packing suggestion on the allocation page now shows only the one
  recommended carton size (fewest boxes needed) instead of listing
  cartons-needed for every configured size. The underlying computation
  and stored data are unchanged — this is display-only.

### Added

- Phase 3 (Stripe Connect and webhooks) — first pieces:
  - Org Stripe Connect onboarding: a "Start/Continue Stripe
    onboarding" button on the organization edit page creates a Connect
    Express account (idempotent — reuses the stored id on repeat
    clicks) and sends the admin to Stripe's hosted onboarding flow.
  - `/api/webhooks/stripe`: one handler for `account.updated` (updates
    `stripe_charges_enabled`/`stripe_payouts_enabled` — never set by
    anything else) and `payment_intent.succeeded`. Verifies Stripe's
    signature, checks `webhook_events` for a fast dedup path, and
    returns success (not an error) on a duplicate delivery so Stripe
    stops retrying it.
  - `checkout_sessions` table (migration `0010`) holding cart line
    items keyed by an id referenced in the PaymentIntent's metadata —
    avoids fitting an entire cart into Stripe metadata's size limits.
    Never used for cash (no PaymentIntent exists for a cash sale).
  - `public.record_sale()` — the channel-agnostic sale writer (one
    write path for card/online and cash, branching only the journal
    entry pattern). Handles the promotion-below-cost edge case
    correctly (flips the Org Payable line to a debit rather than
    going negative) and omits that line entirely when a sale breaks
    exactly even, since a zero-amount journal line is rejected by
    `journal_lines`' own check constraint.
  - `public.record_checkout_sale()` wraps it to process an entire cart
    atomically from the webhook — all-or-nothing, not a loop of
    separate calls where a partial failure could leave some units
    recorded and others not. Idempotency against a redelivered event
    is enforced here via a `for update` row lock + status check on
    `checkout_sessions`, not by the `webhook_events` table alone — see
    the comment on this function for the one gap that leaves (a failed
    attempt needs manual reconciliation, not automatic retry).
  - No buyer-facing checkout yet (Phase 4), so `payment_intent.succeeded`
    has no real caller until then — validated instead via a local
    Postgres smoke test (multi-unit cart writes atomically; a repeat
    call safely no-ops; an unknown payment intent no-ops) and an
    isolated test of the signature-verification logic itself (valid
    signature accepted; wrong secret, tampered payload, and missing
    signature all rejected) using the `stripe` package's own test
    helpers, since the webhook route talks to Supabase over HTTP and
    can't be run against local Postgres directly.
- Edit and delete for carton specs. Delete fails with an inline error
  (not a crash) if a past packing suggestion still references that
  spec — the foreign key blocks it rather than orphaning the reference.

### Changed

- Visual redesign, platform-wide: a playful/colorful design system
  (orange primary, purple accent, warm cream background, a rounded
  heading font) replaces the plain black-and-white admin-tool look.
  Introduced a shared component library (`components/ui/`: Button,
  Input, Select, Textarea, Card, Badge, PageHeader, Field) and every
  existing page — landing, login, unauthorized, and all admin screens —
  was rebuilt on top of it rather than restyled ad hoc, so future
  screens (Phase 3+, org portal, storefront) inherit the same look for
  free. `Badge`'s `statusTone()` helper maps the various status/type
  enum strings (organizations, fairs, catalog items) to a consistent
  color meaning across the app.

### Added

- `/admin/organizations/<id>/edit`: change name, contact info, and
  `status`. Stripe Connect fields (`charges_enabled`/`payouts_enabled`)
  are shown read-only, not editable — those are meant to be set only by
  Stripe's webhook once real onboarding (Phase 3) exists, never by hand.
- `/admin/fairs/<id>/edit`: change a fair's name, dates, `status`, and
  its cash-sales-assumption override. `status` is a manual field for
  now — no automatic lifecycle transitions exist yet (that's tied to
  the close-fair/settlement work in a later phase).
- `/admin/carton-specs`: list and add generic box sizes (name,
  dimensions, max weight) — no schema/migration change needed, since
  `carton_specs` already had an admin-write RLS policy from Phase 1
  with nothing built to use it yet. These are shared across the whole
  catalog, not assigned per item; the packing suggestion picks whichever
  needs the fewest boxes for a fair's total allocated weight.
- Full catalog item editing at `/admin/catalog/<id>/edit` — every field
  from the "Add item" form, including replacing the image (leaving it
  blank keeps the current one; the old image isn't deleted from storage,
  just no longer referenced — a minor known gap, not a correctness issue).
  `stock_on_hand` is directly editable here too, for corrections — routine
  restocking should still use the additive "Receive" action instead.
- Restocking an existing catalog item: a "Receive stock" quantity field
  and button per row on `/admin/catalog`, backed by a new
  `public.receive_stock()` RPC (migration `0009`) that atomically adds to
  `stock_on_hand` rather than requiring a read-then-write from the client.
  Deliberately not ledger-tracked, consistent with how `stock_on_hand` at
  the unallocated stage already wasn't — only the allocation transition
  (Unallocated → Consigned) posts a journal entry. There's still no
  general "edit item" screen for other fields (price, description, etc.).
- Images uploaded from `/admin/catalog/new` are resized (max 1600px) and
  re-encoded as WebP in the browser before upload, cutting typical phone
  photos down substantially — smaller uploads are also less exposed to
  flaky-connection failures. That page also now shows real error messages
  inline instead of crashing to Next.js's generic error screen, since
  adding client-side compression meant converting it off a plain form
  action to an imperative call with its own error handling.
- Catalog item images can now be uploaded as a file from `/admin/catalog/new`
  instead of only pasted as a URL — stored in a new public Supabase Storage
  bucket (`catalog-images`, migration `0008`), write-restricted to platform
  admins. CSV bulk upload still takes `image_url` as a URL string (bulk
  imports are expected to already have hosted images).
- Phase 2 (admin catalog + allocation):
  - Supabase Auth wiring: session-refresh middleware, magic-link
    `/login`, `/auth/callback`, and a `requireAdmin()` guard for admin
    routes (backed by RLS, not just a UX check).
  - `catalog_items.stock_on_hand` (migration `0006`) — Phase 1 tracked
    allocations but never tracked actual warehouse stock to check them
    against.
  - `public.allocate_inventory()` RPC — locks the catalog row, checks
    and decrements stock, upserts the allocation, and posts the
    allocation ledger entry as one atomic operation; rejects
    over-allocation outright. `app.*` stays internal-only (not exposed
    over the API); `public.*` is now the deliberate RPC surface for
    business actions like this one, callable from Server Actions using
    the signed-in admin's own session.
  - Admin screens: `/admin/catalog` (list, quick-add, CSV bulk upload),
    `/admin/organizations` and `/admin/fairs` (minimal scaffolding, not
    the real application-review/Stripe-onboarding or fair-creation
    screens — just enough for a fair to exist), and
    `/admin/fairs/[id]/allocations` (the allocation checklist:
    availability check, lead-time-aware "reorder now" vs. manual-decision
    flag, and a packing suggestion).
  - Packing suggestion is a **weight-only heuristic** (cartons needed ≈
    total allocated weight ÷ carton capacity) — not true volumetric
    packing. Seeded 3 generic carton sizes (migration `0007`) since
    there's no carton-spec management screen yet.
  - Validated against a real local Postgres instance again: the RPC's
    authorization check, atomic stock decrement + ledger posting,
    upsert-on-repeat-allocation, and rejection-with-no-partial-write on
    insufficient stock all covered by a smoke test.
- Phase 1 foundation:
  - Next.js + Supabase project skeleton (`app/`, `lib/supabase/`), builds
    and typechecks cleanly.
  - Full schema migration (`supabase/migrations/0001`–`0005`) implementing
    every table in the spec's data model, plus `platform_admins` — a
    minimal stand-in for a platform-admin role, needed for RLS before
    Phase 7's three-tier roles exist.
  - Double-entry ledger: `app.post_journal_entry()` posts a balanced
    entry or rejects it, backed by a deferred constraint trigger on
    `journal_lines` that enforces the same invariant independently of the
    function. `settlements` has check constraints pinning the net-payout
    formula directly in the schema.
  - Seeded chart of accounts (the 7 accounts from `docs/spec.md`).
  - Foundational RLS: org-scoped access via `app.current_org_ids()`,
    platform-admin bypass via `app.is_platform_admin()`, default-deny on
    tables that should only ever be written by trusted server code
    (`sales`, `journal_entries`, `webhook_events`, `settlements`).
  - All of the above validated against a real local Postgres instance
    (schema applies cleanly; ledger balance enforcement, settlement
    check constraints, and RLS scoping all verified with a smoke test),
    not just reviewed as SQL.

- Initial design spec (`docs/spec.md`): data model, chart of accounts,
  screens, and core workflows for a per-fair book consignment platform.
- User manual (`docs/MANUAL.md`) and this changelog.
- Petty-cash suggestion workflow: suggests a starting cash-drawer float
  and denomination breakdown per fair, from allocation price points and
  an org's cash-vs-card sales ratio.

### Changed

- Settlement journal entries split into explicit card/online vs. cash
  patterns (the original single "any channel" pattern risked
  double-counting an org's margin on cash sales).
- Fair lifecycle collapsed to a single `scheduled → active →
  return_window → closed` sequence, so settlement is computed once,
  after returns are known, instead of being locked at fair-end and later
  amended for missing inventory.
- Net payout formula written out explicitly, including missing-inventory
  cost, which the original prose described but didn't formalize.
- Stripe Connect charge model pinned down: platform is merchant of
  record, using separate charges and transfers, rather than left
  ambiguous between that and a destination-charge model.
- `catalog_items` generalized to support non-book merchandise (pencils,
  erasers, posters, journals, etc.): ISBN made optional, `item_type`
  added; QR/label generation and lead-time/restock logic already didn't
  depend on ISBN specifically.

### Deferred (explicitly, not by omission)

- Sales tax calculation and remittance.
- Chargeback/dispute reconciliation beyond a basic refund.
