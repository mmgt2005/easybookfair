# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project doesn't use semantic versioning yet — entries are grouped
under `[Unreleased]` until Phase 1 produces a first working release, at
which point versioning starts.

## [Unreleased]

### Added

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
