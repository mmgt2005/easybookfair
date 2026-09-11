# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project doesn't use semantic versioning yet — entries are grouped
under `[Unreleased]` until Phase 1 produces a first working release, at
which point versioning starts.

## [Unreleased]

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
