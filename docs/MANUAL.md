# User manual

> **Status**: Phase 2 (admin catalog + allocation) and the Phase 3 pieces
> that exist so far (Stripe Connect onboarding, the payment webhook, and
> an admin-only in-person checkout using a physical Stripe Terminal
> reader) are built and described below as they actually work, not just
> intended behavior. Everything else in this manual still describes
> intended behavior per [`docs/spec.md`](./spec.md), pending its build-plan
> phase.

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
  price, an image file to upload, category, tags, description, and a
  "Packing & shipping" section covering dimensions, weight, lead time, and
  `stock_on_hand` (how many you actually have on the shelf right now —
  added in Phase 2 since allocation needs something concrete to check
  availability against). Dimensions and weight are both optional but feed
  the packing suggestion (see "Allocating a fair" below) — fill in
  whichever you have; the suggestion falls back gracefully when one or
  both are missing. Applies to books and non-book merchandise (pencils,
  erasers, posters, journals, etc.) alike — set the item type to
  distinguish them; ISBN is optional and only used for books.
- **Receive stock**: on the catalog list, each row has a quantity field
  and a **Receive** button — adds to that item's `stock_on_hand` (e.g.
  more copies arrived from the supplier). Use this for routine restocking.
- **Edit an item** (`/admin/catalog/<id>/edit`, via the **Edit** link on
  each row): change any field — title, cost, price, category, tags,
  description, dimensions, weight, lead time, or `stock_on_hand` directly
  (for corrections; prefer "Receive" above for routine restocking since
  that's additive rather than an overwrite). Uploading a new image
  replaces the old one; leaving the image field blank keeps the current
  image as-is.
- **Bulk upload** (`/admin/catalog/upload`): CSV with a header row —
  required columns `title`, `cost`, `price`; everything else (including
  `length_in`/`width_in`/`height_in`) optional. `tags` within a cell is
  semicolon-separated (a CSV already uses commas as its own delimiter).
  `image_url` here is still a URL string, not a file — bulk-imported
  items are expected to already have hosted images.
- **Labels**: not built yet — still Phase 6 per the build plan.

### Carton specs (`/admin/carton-specs`)

A shared list of generic box sizes (not assigned per catalog item) —
name, dimensions, and max weight capacity. The packing suggestion on a
fair's allocation page picks whichever of these needs the fewest boxes
for that fair's total allocated weight. Add, edit, or delete sizes here
if the default Small/Medium/Large don't match your actual cartons.
Deleting one that's still referenced by a past packing suggestion is
blocked with an inline error rather than silently orphaning that
suggestion's record.

### Organizations and fairs (`/admin/organizations`, `/admin/fairs`)

The application-review workflow itself is still minimal scaffolding:
creating an organization here marks it `approved` immediately with no
review step. This exists so a fair has an org to belong to, and
allocation has a fair to allocate against.

**Editing an organization** (`/admin/organizations/<id>/edit`): change
name, contact info, and `status` (pending/approved/declined). Below that,
a **Stripe Connect** card shows current charges/payouts status and a
button — "Start Stripe onboarding" the first time, "Continue Stripe
onboarding" if an account exists but isn't fully set up yet, "Update
Stripe details" once it is. Clicking it creates (or reuses) a Connect
Express account and sends you to Stripe's own hosted onboarding flow.
**Charges/payouts status only updates once Stripe's `account.updated`
webhook actually confirms it** — not just because the org clicked through
the link — so it can take a moment (or a page refresh) to reflect after
finishing onboarding.

### Editing a fair (`/admin/fairs/<id>/edit`, via the **Edit** link)

Change the name, dates, or `status`, and override the platform's default
cash-sales-ratio assumption for this specific fair. Status is a manual
field for now — nothing transitions it automatically yet (that's tied to
the settlement/close-fair work in a later phase), so set it yourself as
the fair progresses.

**Terminal setup** (same page): needed once per fair before the checkout
screen can charge cards with a physical reader. Fill in the venue's
address and click "Create Terminal location" — this creates a Stripe
Terminal Location and is a one-time step per fair. Then register each
physical reader using the registration code shown on the reader's own
screen; once it shows `online` here, it's ready to use at
`/admin/fairs/<id>/checkout`. **Only internet-connected readers work** —
BBPOS WisePOS E or Stripe Reader S700. Bluetooth readers and Tap to Pay
on iPhone/Android aren't usable from this web app (both require Stripe's
native mobile SDKs, which a browser can't invoke).

### Allocating a fair (`/admin/fairs/<id>/allocations`)

1. Each catalog item's row shows current `stock_on_hand` and how much is
   already allocated to this fair. Enter a quantity and **Allocate** —
   this calls the `allocate_inventory` database function, which locks
   the item's stock row, decrements it, and posts the allocation ledger
   entry (Consigned ↔ Unallocated) as one atomic operation. Requesting
   more than available stock is rejected outright with nothing written.
   If anything is already allocated, a second **Remove** field/button
   appears below it — reduces the allocation and returns those units to
   `stock_on_hand`, posting the reverse ledger entry. It refuses to pull
   back units that have already sold (checks completed sales for this
   fair/item first) — those copies are gone, not sitting unsold.
2. If the fair's start date leaves enough lead time for the item, the
   row instead offers **Reorder now**: enter the shortfall and the date
   you actually placed the order with the supplier (defaults to today,
   but backdatable — useful if you called it in days ago and are only
   logging it now), and it allocates whatever stock exists now (if any),
   then reserves a `restock_orders` row against that allocation for the
   rest. `expected_arrival` is computed from the order date you enter,
   not from today, so a backdated entry gets the right due date. Without
   enough lead time, the row just flags it for you to decide manually
   (reduce quantity, substitute, or reschedule) — there's no automatic
   action to take.
3. **Packing suggestion**: click Recompute to get the recommended carton
   size and an actual packing list — "Carton 1: 15× Title A, 10× Title B",
   and so on — via a first-fit-decreasing bin-packing pass. Checks **both
   weight and volume** (computed from each item's length/width/height) —
   a carton fills up on whichever limit it hits first, same as a real box
   has both a weight rating and a physical size. An item missing one of
   the two measurements is packed by whichever one it has; an item with
   neither gets grouped into its own carton
   at the end rather than silently mixed in or dropped from the list.
4. **Cash drawer setup**: not built yet.

### Application review

Still no dedicated review screen (approve/decline lives on the
organization edit page's Status field instead — see above), but the
Stripe half of this is real now: the "Start/Continue Stripe onboarding"
button on that same page creates the Connect Express account and sends
the org to Stripe's hosted flow. As designed, the org isn't marked active
until Stripe confirms `charges_enabled`/`payouts_enabled` via webhook,
never just from clicking the link.

### Payments

The payment webhook (`/api/webhooks/stripe`) and its sale-writing
functions exist and are tested. `payment_intent.succeeded` looks up a
`checkout_sessions` row by `payment_intent_id` and writes one `sales`
row (plus its ledger entry) per unit in the cart, atomically.

**In-person checkout with a physical reader** (`/admin/fairs/<id>/checkout`)
is the first real caller of this path — see "Allocating a fair" → this
page's parent, and "Terminal setup" on the fair's Edit page, above.
Build a cart from that fair's available-to-sell stock (allocated minus
already-completed sales), click "Connect reader" once, then "Charge $X
with reader" — this creates the `checkout_sessions` row and PaymentIntent,
collects payment on the physical reader, and the webhook finalizes the
sale asynchronously once Stripe confirms it (the screen polls briefly and
shows "Sale recorded" when it lands). This screen is admin-only for now —
there's no separate org-staff login yet, so it isn't scoped to "whoever
is running the booth" the way the eventual volunteer checkout will be.

The buyer-facing **online storefront** (self-checkout, no reader) is
still Phase 4 proper — nothing yet creates an `online`-channel
`checkout_sessions` row. See the README's "Stripe setup" section for how
to exercise that path manually via the Stripe CLI in the meantime.

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
