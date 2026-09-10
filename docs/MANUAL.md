# User manual

> **Status**: Phase 2 (admin catalog + allocation) is built and described
> below as it actually works, not just intended behavior. Everything else
> in this manual still describes intended behavior per
> [`docs/spec.md`](./spec.md), pending its build-plan phase.

## Signing in

Admin screens live under `/admin` and require a session — go to `/login`,
enter your email, and follow the magic link Supabase emails you. Being
signed in isn't enough on its own: your user id also has to be a row in
`platform_admins` (an existing admin adds it directly in the database for
now — there's no self-serve admin invite flow yet), or you'll land on
`/unauthorized` after signing in.

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

### Catalog and inventory (`/admin/catalog`)

- **Add an item** (`/admin/catalog/new`): quick-add form — title, cost,
  price, an image file to upload, category, tags, description, weight, lead time,
  and `stock_on_hand` (how many you actually have on the shelf right
  now — added in Phase 2 since allocation needs something concrete to
  check availability against). Applies to books and non-book
  merchandise (pencils, erasers, posters, journals, etc.) alike — set
  the item type to distinguish them; ISBN is optional and only used for
  books.
- **Receive stock**: on the catalog list, each row has a quantity field
  and a **Receive** button — adds to that item's `stock_on_hand` (e.g.
  more copies arrived from the supplier). Use this for routine restocking.
- **Edit an item** (`/admin/catalog/<id>/edit`, via the **Edit** link on
  each row): change any field — title, cost, price, category, tags,
  description, weight, lead time, or `stock_on_hand` directly (for
  corrections; prefer "Receive" above for routine restocking since that's
  additive rather than an overwrite). Uploading a new image replaces the
  old one; leaving the image field blank keeps the current image as-is.
- **Bulk upload** (`/admin/catalog/upload`): CSV with a header row —
  required columns `title`, `cost`, `price`; everything else optional.
  `tags` within a cell is semicolon-separated (a CSV already uses commas
  as its own delimiter). `image_url` here is still a URL string, not a
  file — bulk-imported items are expected to already have hosted images.
- **Labels**: not built yet — still Phase 6 per the build plan.

### Carton specs (`/admin/carton-specs`)

A shared list of generic box sizes (not assigned per catalog item) —
name, dimensions, and max weight capacity. The packing suggestion on a
fair's allocation page picks whichever of these needs the fewest boxes
for that fair's total allocated weight. Add more sizes here if the
default Small/Medium/Large don't match your actual cartons.

### Organizations and fairs (`/admin/organizations`, `/admin/fairs`)

Minimal scaffolding, not the real screens from the spec: creating an
organization here marks it `approved` immediately with no review step,
and there's no Stripe Connect onboarding trigger yet (that's Phase 3).
This exists only so a fair has an org to belong to, and allocation has a
fair to allocate against.

### Allocating a fair (`/admin/fairs/<id>/allocations`)

1. Each catalog item's row shows current `stock_on_hand` and how much is
   already allocated to this fair. Enter a quantity and **Allocate** —
   this calls the `allocate_inventory` database function, which locks
   the item's stock row, decrements it, and posts the allocation ledger
   entry (Consigned ↔ Unallocated) as one atomic operation. Requesting
   more than available stock is rejected outright with nothing written.
2. If the fair's start date leaves enough lead time for the item, the
   row instead offers **Reorder now**: enter the shortfall and it
   allocates whatever stock exists now (if any), then reserves a
   `restock_orders` row against that allocation for the rest. Without
   enough lead time, the row just flags it for you to decide manually
   (reduce quantity, substitute, or reschedule) — there's no automatic
   action to take.
3. **Packing suggestion**: click Recompute to get a cartons-needed
   estimate per configured carton size, based on the fair's total
   allocated weight. This is a **weight-only heuristic** (total weight ÷
   carton weight capacity, rounded up) — not true volumetric/dimensional
   bin packing. Good enough to gauge roughly how many boxes you need, not
   to plan exactly what goes in which box.
4. **Cash drawer setup**: not built yet.

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
