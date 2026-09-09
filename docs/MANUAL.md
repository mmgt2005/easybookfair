# User manual

> **Status**: no software has been built yet — this describes intended
> behavior per [`docs/spec.md`](./spec.md). Each section will be
> rewritten against the real screens as its build-plan phase ships, and
> this notice will be removed once Phase 1 has a working app to describe.

## Roles

- **Platform admin** — manages the catalog, reviews org applications,
  assigns allocations, closes fairs. (Phase 7 adds tenant admin and
  platform super-admin above this.)
- **Org staff** (`org_admin` / `org_staff` in `org_members`) — runs their
  organization's fair: checkout, live sales tracking, viewing payout
  status.
- **Buyer** — browses and checks out on the public, per-fair storefront.
  No account required.

## Admin guide

### Catalog and inventory

- **Add an item**: single quick-add form (title, cost, price, image,
  category, tags, description, weight, lead time) or CSV bulk upload.
  Applies to books and non-book merchandise (pencils, erasers, posters,
  journals, etc.) alike — set `item_type` to distinguish them for
  filtering/reporting; ISBN is optional and only used for books.
- **Labels**: a QR code/label is generated automatically when an item is
  added. For items without a manufacturer barcode, configure a label
  template once (sheet/label dimensions, margins, gaps, rows/columns)
  and reuse it for batch printing at packing time, on any printer/label
  brand.

### Allocating a fair

1. Review the org's requested quantities in the allocation checklist.
2. The system checks each item's available-to-promise stock against the
   fair's start date and the item's lead time. A shortfall with enough
   lead time offers "reorder now" (reserves a restock order against this
   allocation); otherwise it's flagged for you to reduce quantity,
   substitute, or reschedule.
3. Packing suggestions show efficient carton packing for the finalized
   allocation.
4. **Cash drawer setup**: review the suggested starting petty-cash float
   and denomination breakdown for this fair (computed from the
   allocation's price points and the org's assumed or historical cash
   sales ratio); adjust if needed.

### Application review

Approve or decline partner org applications. Approving triggers Stripe
Connect Express onboarding — the org isn't marked active until Stripe
confirms `charges_enabled` and `payouts_enabled`, not just that they
clicked the onboarding link.

### Closing a fair

A fair's settlement is computed **once**, after the return deadline
passes (not at the fair's end date — see "Fair lifecycle" in the spec).
At that point:

- Wholesale owed, org payout, returns, and any missing/unreturned
  inventory are calculated together.
- One settlement journal entry posts and locks the fair.
- A payout statement and return manifest are generated.
- If the org is owed money, a Transfer moves it to their Connect
  account; if the org owes money instead (cash sales + missing
  inventory exceeded their card/online payout), they receive a single
  Stripe Payment Link for the net amount.

A refund requested after a fair has closed does **not** reopen the
settlement — it posts as a separate adjustment entry referencing it.

## Org staff guide

### Running checkout (volunteer checkout)

- Find items by barcode scan, search, or a "top sellers" quick list.
- Add to cart — bundle discounts from active promotions apply
  automatically; you don't choose discounts at checkout.
- Take payment by card (online Checkout or in-person Stripe Terminal) or
  cash. Cash sales are recorded the same way as card sales in the
  system, just flagged `channel = cash`.

### Tracking your fair

The org portal shows live allocation status, a live sales feed, and an
estimated payout that updates as sales come in — final numbers are only
locked when the admin closes the fair.

### Cash sales — what you actually owe

Because you hold the cash directly when a buyer pays cash, you don't get
a separate payout for those units — you already have your margin in the
cash box. What you owe the supplier is the wholesale cost of each cash
sale, which is netted against your card/online payout at fair close, not
paid separately.

### Returning unsold inventory

Return unsold items by the fair's return deadline. Reminders go out
before the deadline. Anything not returned by then is billed to you at
wholesale cost as part of the same fair-close settlement — there's no
separate "missing inventory" bill later.

## Buyer guide

Browse a fair's storefront (scoped to that specific fair — you won't see
other orgs' inventory), add items to your cart, and check out online.
Promotions/bundle discounts, if any are active, apply automatically.

## Not yet supported

- Sales tax calculation or remittance.
- Chargeback/dispute reconciliation beyond a basic refund.

These are called out as deferred in the spec, not silently missing.
