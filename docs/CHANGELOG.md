# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project doesn't use semantic versioning yet — entries are grouped
under `[Unreleased]` until Phase 1 produces a first working release, at
which point versioning starts.

## [Unreleased]

### Added

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
