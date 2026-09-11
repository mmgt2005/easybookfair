# Book fair consignment platform — design spec

## Overview

A platform where a supplier organization consigns inventory to partner
organizations (schools, churches, homeschool co-ops) who run book fair
fundraisers. Buyers pay through the platform's payment system; at the end
of each fair, the org receives payout for items sold and returns unsold
items to the supplier. All transactions are documented and reportable.

Inventory is not limited to books — the consignment/settlement model
operates on cost vs. price per catalog item, so non-book merchandise
(pencils, erasers, posters, journals, and similar fair add-ons) consigns,
sells, and settles identically once entered in `catalog_items`. See
"Data model" for the schema change this implies.

Pre-Phase-7, "the supplier" and "the platform" are the same entity: this
is a single business running its own consignment operation. Phase 7
introduces other companies ("tenants") running the same kind of business
on top of the platform as a SaaS product — see below.

## Business model

- The supplier owns the catalog and sets wholesale cost + retail price
  per title.
- Partner orgs apply, get approved, and receive an inventory allocation
  for their fair.
- Buyers pay via the platform's Stripe account (online checkout or
  in-person Terminal), or with cash collected directly by the org.
- **Settlement is per-fair** — each fair fully closes and settles on its
  own; no rolling balance across fairs.
- Settlement math (accrual basis, revenue recognized at time of sale):
  - **Wholesale owed to supplier** = units sold × wholesale cost
  - **Org payout** = units sold × (price charged − wholesale cost),
    **card/online units only** — see "Cash sales" below.
  - **Cash sales invert the flow** — the org already holds the full
    retail amount when a buyer pays cash, so they owe the supplier only
    the wholesale portion; they do not additionally receive a payout for
    those units (their margin is already sitting in their cash box).
  - **Missing/unreturned inventory** past the return deadline is billed
    to the org at wholesale cost, folded into the same settlement as a
    cash shortfall would be (see "Fair lifecycle" below for when this is
    computed).
  - **Net payout**, computed once at fair close:
    ```
    cash_wholesale_owed     = Σ (cash-sale units × wholesale cost)
    missing_inventory_cost  = Σ (unreturned units × wholesale cost)
    total_owed_by_org       = cash_wholesale_owed + missing_inventory_cost
    payout_due              = Σ (card/online-sale units × (price − cost))
    net_payout              = payout_due − total_owed_by_org
    ```
    - If `net_payout >= 0`: transfer `net_payout` to the org's Stripe
      Connect account.
    - If `net_payout < 0`: send the org a single Stripe Payment Link for
      `abs(net_payout)` — one link, net of everything owed, not separate
      links for cash shortfall vs. missing inventory.

## Fair lifecycle

Resolves the sequencing between "close fair" and the return deadline: the
settlement is computed **once**, after returns are known, so it is never
locked and then amended.

```
scheduled → active → return_window → closed
```

- **active**: fair is open, sales are being recorded.
- **return_window**: sales have stopped (fair end date reached); org has
  a grace period to physically return unsold inventory. Reminder
  notifications fire before the return deadline.
- **closed**: triggered automatically the moment the return deadline
  passes (or manually by an admin once returns are already reconciled
  early). This is the one "close fair" action: it aggregates sales vs.
  allocation, computes wholesale owed / payout / returns / missing
  inventory **together**, posts a single settlement journal entry, and
  generates the payout statement and return manifest. Nothing about the
  fair's settlement numbers is final before this point, and nothing
  changes after it — a post-close correction (e.g. a late refund) is a
  separate, explicit settlement-adjustment entry referencing the closed
  settlement, not a rewrite of it.

## Tech stack

- **Next.js + Supabase** — single codebase, three surfaces (admin
  console, org portal, public storefront), Supabase Auth + row-level
  security for access control.
- **Supabase Edge Functions / Postgres triggers** — handle Stripe
  webhooks and downstream logic directly in the database; no third-party
  automation layer (no Make.com, no Glide). Tradeoff accepted knowingly:
  this is harder to unit-test and observe than app-layer code, so
  settlement/ledger logic that needs strong test coverage should live in
  Edge Functions (testable in isolation) rather than deep in triggers
  where practical; triggers are reserved for invariants that must hold
  no matter what writes the row (e.g. idempotency guards).
- **In-house double-entry ledger** — no QBO; a real chart of accounts
  with journal entries, built for accrual accounting and auditability.
- **Stripe Connect (Express accounts), separate-charges-and-transfers
  model** — the platform is the merchant of record. Charges (online
  Checkout and in-person Terminal alike) are created on the **platform's**
  own Stripe account, not the org's connected account. At fair close, the
  org's net payout share is moved via a **Transfer** to their Connect
  Express account. When an org owes money instead, they're charged
  directly via a Stripe Payment Link (a regular charge on the platform's
  account, not a debit from their connected balance). This is why the
  ledger can model a single "Stripe Clearing" account that the platform
  fully controls.

## Data model

Core tables (see `supabase/migrations/0001_init.sql` for full schema):

| Table | Purpose |
|---|---|
| `organizations` | Partner orgs, application status, Stripe Connect account |
| `platform_admins` | Minimal stand-in for a platform-admin role ahead of Phase 7's three-tier role system — membership is what RLS treats as full access |
| `org_members` | Maps users to organizations with a role (`org_admin`, `org_staff`); needed from the org portal on, extended with platform/tenant roles in Phase 7 |
| `catalog_items` | Master item list — books and non-book merchandise: `item_type` (`book`/`merchandise`), title, SKU (general identifier; `isbn` nullable, populated only for books), cost, price, image, category, tags, description, weight, lead time, `stock_on_hand` (unallocated warehouse quantity — the physical counterpart to the `1100` ledger balance; added in Phase 2 once allocation needed something to check availability against) |
| `fairs` | One per org's event; `status` (`scheduled`/`active`/`return_window`/`closed`) drives the settlement lifecycle; `cash_sales_assumption_pct` seeds the petty-cash suggestion (see "Petty cash suggestion") |
| `allocations` | Inventory checked out to an org for a specific fair |
| `carton_specs` / `packing_suggestions` | Shipping/packing efficiency for allocation |
| `restock_orders` | Lead-time tracking, reserved against a specific allocation |
| `promotions` | Bundle/percent discounts, platform-wide |
| `sales` | One row per unit sold, any channel (online/in-person/cash); `payment_intent_id` groups units from the same checkout for receipts and whole-cart refunds; `status` (`completed`/`refunded`/`disputed`) |
| `checkout_sessions` | Cart line items for a card/online checkout, keyed by an id referenced in the PaymentIntent's metadata — added in Phase 3 so the payment webhook can look up a cart by `payment_intent_id` instead of trying to fit it into Stripe metadata's size limits. Never used for cash (no PaymentIntent exists for a cash sale at all) |
| `webhook_events` | Stripe event ID (primary key) + type + received_at, checked before any webhook write is applied — the idempotency guard the payment webhook depends on |
| `accounts` | Chart of accounts |
| `journal_entries` / `journal_lines` | Double-entry ledger |
| `settlements` | One row per fair, per org |

**Design decision — `sales` grain**: kept as one row per unit (not a
`quantity` column) so per-unit inventory tracking and unit-level refunds
stay simple; a 20-book cart is 20 rows sharing one `payment_intent_id`.
Revisit if row volume becomes a real concern.

**Design decision — merchandise support**: ISBN is the only book-specific
assumption in the original schema, so it becomes optional; QR/label
generation, barcode scanning, and lead-time/restock logic already key
off SKU/barcode and `lead_time_days`, not ISBN, so they need no change
to support pencils, erasers, posters, journals, etc. alongside books.
`item_type` exists mainly for catalog filtering/reporting, not because
the settlement math treats the two differently — it doesn't.

**Explicitly deferred, not designed yet**:
- Sales tax (no tax calculation, `Sales Tax Payable` account, or
  remittance flow). Needs a jurisdiction/exemption decision before it's
  designed — not something to guess at here.
- Chargebacks/disputes beyond a simple refund (a `disputed` sales status
  exists as a placeholder; the reconciliation workflow around it is not
  built out).

## Accounting

**Chart of accounts:**

- `1000` Stripe Clearing (asset)
- `1100` Inventory — Unallocated (asset)
- `1200` Inventory — Consigned to Orgs (asset)
- `1300` Accounts Receivable — Orgs (asset)
- `2000` Org Payable (liability)
- `4000` Wholesale Revenue (revenue)
- `5000` Payment Processing Fees (expense)

**Journal entry patterns:**

| Event | Debit | Credit |
|---|---|---|
| Allocation (checkout to org) | Inventory — Consigned | Inventory — Unallocated |
| Sale — card/online | Stripe Clearing (full price) | Wholesale Revenue (cost) + Org Payable (price − cost) |
| Sale — cash | Accounts Receivable — Orgs (cost) | Wholesale Revenue (cost) |
| Stripe processing fee | Payment Processing Fees | Stripe Clearing |
| Refund — card/online sale | Wholesale Revenue (cost) + Org Payable (price − cost) | Stripe Clearing (full price) |
| Refund — cash sale | Wholesale Revenue (cost) | Accounts Receivable — Orgs (cost) |
| Payout to org (net positive) | Org Payable | Stripe Clearing |
| Org payment via Payment Link (net negative) | Stripe Clearing | Accounts Receivable — Orgs |
| Unsold return | Inventory — Unallocated | Inventory — Consigned |
| Missing inventory billed | Accounts Receivable — Orgs | Inventory — Consigned |

A refund restores the unit to available inventory and reverses exactly
the entry the original sale posted. A refund requested **after** the
fair's settlement has closed is a separate settlement-adjustment entry
referencing the closed settlement, not a reopening of it.

Revenue recognizes **at time of sale** (accrual), not at payout — payout
and inventory return are separate, independently-triggered actions that
both key off the same locked settlement numbers from "close fair."

## Screens

1. **Admin dashboard** — active fairs, revenue/wholesale-owed totals,
   pending applications
2. **Org portal** — allocation status, live sales feed, estimated payout
3. **Storefront** — buyer-facing browse and checkout (per-fair scoped)
4. **Volunteer checkout** — item picker (barcode scan / search / top
   sellers), cart with automatic bundle discounts, card or cash payment
5. **Settlement close-out** — reconciliation, payout/wholesale amounts,
   return manifest, "close fair" action
6. **Inventory add** — quick form (with image, category, tags,
   description) and CSV bulk upload
7. **Allocation assignment** — checklist with quantities, availability
   check against lead time, packing suggestion
8. **Application review** — approve/decline, Stripe Connect onboarding
   trigger
9. **Cash drawer setup** — suggested petty-cash float and denomination
   breakdown for a fair, computed from its allocation, editable before
   the fair opens (see "Petty cash suggestion")

## Core workflows

**Settlement calculation** (triggered when the return deadline passes,
or manually once returns are reconciled — see "Fair lifecycle"):
aggregate sales vs. allocation and known returns → calculate wholesale
owed, payout, and missing-inventory cost together → post the one
settlement journal entry (locks the fair) → generate payout statement
and return manifest.

**Stripe Connect onboarding**: org approved → Connect Express account
created → onboarding link sent → org completes ID/banking → webhook
confirms → org marked active (gated on `charges_enabled` /
`payouts_enabled`, not just link-clicked).

**Payment webhook**: one handler for both online and in-person sales —
channel is just metadata on the PaymentIntent. Must be **idempotent**:
the Stripe event ID is checked against `webhook_events` before any write,
so a redelivered webhook never double-counts revenue.

**Promotions**: defined ahead of time (not discretionary at checkout),
platform-wide, evaluated against the cart before the PaymentIntent is
created; discount is allocated proportionally across bundle line items
so each sale row's `price_charged` stays accurate for the ledger.

**Cash sales**: recorded with `channel = 'cash'`, no Stripe PaymentIntent;
money-owed direction inverts (org owes wholesale, not the reverse) — see
the dedicated cash journal entry pattern above.

**Refunds**: a buyer refund before fair close reverses the original
sale's journal entry and returns the unit to available inventory. A
refund after close is a settlement-adjustment entry against the closed
settlement, handled explicitly rather than automatically.

**Missing/unreturned inventory**: return deadline per fair, automatic
reminder before it; unreturned units are billed to the org at wholesale
cost as part of the single close-fair settlement computation (not a
separate after-the-fact billing pass).

**Inventory availability at allocation**: checks requested quantity
against available-to-promise stock and the fair's start date vs. each
item's `lead_time_days`. If a shortfall exists and there's enough lead
time, offers "reorder now" (creates a `restock_orders` row reserved
against that allocation); otherwise flags for a manual decision (reduce
quantity, substitute, or reschedule).

**Petty cash suggestion**: before a fair opens, suggests a starting
cash-drawer float sized to make change for expected cash sales:

```
expected_cash_sales_revenue = Σ(allocated item price) × cash_sales_assumption_pct
suggested_float_total       = expected_cash_sales_revenue × change_buffer_factor
```

- `cash_sales_assumption_pct` defaults to a configurable estimate (e.g.
  25%) and is refined automatically from that org's own trailing
  cash-vs-card revenue split across their past closed fairs once that
  history exists.
- `change_buffer_factor` (e.g. 1.15–1.25) covers that a float needs
  change-making capacity, not just a share of expected revenue.
- The denomination breakdown (counts of $1s, $5s, $10s, quarters) is
  derived from the actual price points in that fair's allocation, so
  a catalog full of $7.99 items suggests plenty of $1s and quarters,
  not just round bills.
- This is a suggestion, not an enforced amount — admins/org staff can
  override it, and accuracy improves after an org's first few fairs.

**QR codes and labels**: generated automatically when a catalog item is
added. For items without a manufacturer barcode, a brand-agnostic label
template configurator (sheet/label dimensions, margins, gaps, rows/
columns entered once and reused) drives batch label printing at packing
time, working with any printer/label brand.

## Multi-tenant SaaS (Phase 7 — final)

Adds a tenant layer above organizations: Platform (you) → Tenant
(another company running their own book fair business) → Organizations
→ Fairs. Key changes:

- `tenant_id` added to every table, RLS scoped accordingly
- Each tenant connects **their own Stripe account** via OAuth (not
  routed through the platform's Stripe account) — keeps the platform as
  a software provider, not a money intermediary
- **Open risk to spike early, not assume**: this makes each tenant's
  Stripe account itself act as a platform for *their* orgs' Connect
  Express sub-accounts — nested Connect. Confirm Stripe supports the
  specific nesting this requires before committing to the design; it is
  a materially different integration than the single-level Connect used
  pre-Phase-7.
- Webhook routing keys off the `account` field in each Stripe event to
  attribute it to the right tenant
- Promotions, label templates, and carton specs become per-tenant
  settings
- Three-tier roles: platform super-admin → tenant admin → org staff
  (extends `org_members` rather than replacing it)
- Per-tenant branding/subdomain; separate Stripe relationship for
  billing tenants their SaaS subscription

## Build plan

1. **Foundation** — schema, ledger, seeded chart of accounts
2. **Admin: catalog and allocation** — inventory add, allocation
   checklist, packing suggestions
3. **Stripe Connect and webhooks** — org onboarding, payment webhook,
   channel-agnostic sale writing
4. **Org portal and storefront** — org dashboard, buyer storefront,
   promotions, volunteer checkout
5. **Settlement and close-out** — close-fair flow, payout statements,
   return manifests, missing-inventory billing
6. **QR labels and restock timing** — label generation/printing,
   lead-time-aware allocation checks
7. **Multi-tenant SaaS** — deliberately last; proves the single-tenant
   product first
