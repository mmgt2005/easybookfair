# User manual

> **Status**: Phase 2 (admin catalog + allocation), Phase 3 (Stripe Connect
> onboarding, the payment webhook), and most of Phase 4 (buyer payment
> options — in-person reader, online storefront with pickup, student
> wallets, cash) are built and described below as they actually work, not
> just intended behavior. An org staff portal (`/org`) also now exists —
> an org requests a fair instead of an admin creating one directly, and
> chooses which payment options it wants (each explained before they
> choose). Also built, pulled forward from later phases: promotions/bundle
> discounts, a deliberately scoped-down "close this fair" settlement, an
> author-submission flow with its own minimal portal, an onboarding tour,
> and a demo/training fair. Everything else in this manual still describes
> intended behavior per [`docs/spec.md`](./spec.md), pending its build-plan
> phase.

## Signing in

Admin screens live under `/admin` and require a session — go to `/login`,
enter your email, and follow the magic link Supabase emails you. Being
signed in isn't enough on its own: your user id also has to be a row in
`platform_admins` (an existing admin adds it directly in the database for
now — there's no self-serve admin invite flow yet), or you'll land on
`/unauthorized` after signing in.

Org staff screens live under `/org` and work the same way, except your
user id needs to be a row in `org_members` instead (also added directly
in the database for now by an existing admin — see "Local setup" in the
README). Once a fair request is approved, the requester gets an email
pointing them at `/org` — signing in there works the same magic-link way.

Author screens live under `/author` and are different from the other
two: there's no manual database insert — your account is created
automatically the first time an admin approves something you submitted
at `/author/submit` (see "Author guide" below).

Everywhere a portal exists, a **"🎓 Take the tour"** link sits in its nav
— a short walkthrough of that portal's own screens. It shows itself
automatically the first time you visit (per browser, not per account),
but the nav link relaunches it any time after that too, first visit or
not.

## Roles

- **Platform admin** — manages the catalog, reviews org applications,
  fair requests, and author submissions, assigns allocations, closes
  fairs. (Phase 7 adds tenant admin and platform super-admin above this.)
- **Org staff** (`org_admin` / `org_staff` in `org_members`) — requests a
  fair for their organization (choosing which payment options it should
  offer) and tracks its status, including its eventual payout, from
  `/org`. Running checkout and a live sales feed are still admin-only for
  now — see "Org staff guide" below for exactly what's built versus still
  intended.
- **Author** — submits books/merchandise for the platform to carry
  (`/author/submit`, no account needed) and, once approved, tracks their
  submissions and sales from `/author`. See "Author guide" below.
- **Buyer** — browses and checks out on the public, per-fair storefront.
  No account required.

## Admin guide

### Manual & version (`/admin/manual`)

The admin nav's "Manual" link renders this file and `docs/CHANGELOG.md`
directly in the app, alongside the running app's version (from
`package.json`) — no need to leave the dashboard or dig through the repo
to check either.

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
name, contact info, `status` (pending/approved/declined), and whether it's
**"a school"** — a checkbox that gates the student-wallet feature (see
"Student wallets" below) for all of that org's fairs; leave it off for any
non-school consignor. Below that, a **Stripe Connect** card shows current
charges/payouts status and a button — "Start Stripe onboarding" the first
time, "Continue Stripe onboarding" if an account exists but isn't fully
set up yet, "Update Stripe details" once it is. Clicking it creates (or
reuses) a Connect Express account and sends you to Stripe's own hosted
onboarding flow. **Charges/payouts status only updates once Stripe's
`account.updated` webhook actually confirms it** — not just because the
org clicked through the link — so it can take a moment (or a page
refresh) to reflect after finishing onboarding.

### Reviewing fair requests (`/admin/fair-requests`)

An org staff member requests a fair from their own portal (`/org/fairs/request`)
instead of an admin creating one directly — the request lists the org,
requested dates, and which payment options they asked for (in-person
reader, online storefront, student wallets, cash). Each pending request
shows **Approve** and **Decline** buttons:

- **Approve** creates the real `fairs` row from the requested name,
  dates, and payment-option choices, links the request to it, and emails
  the requester a link to their dashboard. If they asked for the
  in-person reader, an **equipment rental fee** field appears (defaults to
  $25) — set however much makes sense; it's netted against the org's
  payout when the fair closes (see "Closing a fair" below). From there it
  behaves exactly like a fair created directly (allocate stock, set up a
  Terminal reader, etc. — see below).
- **Decline** takes an optional note (shown back to the org on their
  dashboard) and does not create a fair.

Once reviewed, a request is final — there's no re-opening a declined
request or un-approving one; create a new fair (or edit the resulting
one) instead. A request submitted by an admin "viewing as" that org (see
below) is flagged inline so it's never mistaken for something the org
submitted themselves.

### Editing a fair (`/admin/fairs/<id>/edit`, via the **Edit** link)

Change the name, dates, or `status`, and override the platform's default
cash-sales-ratio assumption for this specific fair. Status is a manual
field for now — nothing transitions it automatically yet (that's tied to
the settlement/close-fair work in a later phase), so set it yourself as
the fair progresses.

**Payment options** (same page): the four checkboxes an org chose from
when requesting the fair (in-person reader, online storefront, student
wallets, cash) live here too and can be adjusted after approval — turning
one off actually disables that channel, not just hides it: the public
storefront/wallet pages stop offering it, and the underlying checkout/
funding actions reject it even if called directly. The cash checkbox is
the exception — it's captured but not enforced anywhere, since there's no
cash-sale-recording UI in the app yet. When in-person is on, an
**equipment rental fee** field appears next to it — same figure set at
approval, adjustable here any time before the fair closes.

**Public links** (same page, near the top): the same storefront/
student-wallet links the org sees on their own dashboard — handy for
sharing directly, or double-checking what a buyer would actually see.

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
   action to take. Once reserved, that row becomes an editable form in
   place of the plain summary — correct the quantity, order date, expected
   arrival, or status (e.g. mark it "Received") any time, independently of
   each other; a supplier-communicated delay doesn't have to be re-derived
   from the original order date.
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

### Promotions (`/admin/fairs/<id>/promotions`)

Bundle deals and percent-off discounts, scoped to one fair and applied
**automatically** at checkout — buyers never choose or enter a code, and
neither does whoever's running the register; it just comes off the
total.

- **Percent off**: a flat percent off either every item at the fair, or a
  specific subset you pick — optionally only once the cart holds at least
  some minimum quantity of those items.
- **Bundle** ("any N for $X"): pick a pool of eligible items, a quantity,
  and a flat price for that quantity — e.g. "any 3 of these books for
  $15." If a cart holds more than the pool needs, the extra units are
  still charged at full price; the discount always favors the buyer by
  bundling the highest-priced eligible items first.

A promotion applies to **online, in-person, and wallet** checkouts alike
— there's one shared implementation (`lib/promotions.ts`), not a
per-channel reimplementation. Deactivate (rather than delete) a promotion
to pause it without losing its settings; delete removes it outright.
Dates are optional — leave start/end blank for "always active while
turned on."

### Application review

Still no dedicated review screen (approve/decline lives on the
organization edit page's Status field instead — see above), but the
Stripe half of this is real now: the "Start/Continue Stripe onboarding"
button on that same page creates the Connect Express account and sends
the org to Stripe's hosted flow. As designed, the org isn't marked active
until Stripe confirms `charges_enabled`/`payouts_enabled` via webhook,
never just from clicking the link.

### Demo fair (`/admin/demo`)

A permanent, resettable sandbox fair (seeded by migration `0035`) for
training — five `[Demo]`-prefixed catalog items already allocated to it,
with allow-online/wallet/in-person/cash all turned on, so you (or an org
you add to it) can click through allocation, checkout, the public
storefront, and student wallets without touching real data. **Reset demo
data** clears every sale/checkout/wallet/settlement made against it and
puts the catalog stock/allocation back to the same starting point —
irreversible, but safe any time since nothing there is real. To try the
org side of it too, add someone to `org_members` for the demo
organization the normal manual way (see "Local setup" in the README).

### Reviewing author submissions (`/admin/author-submissions`)

Authors and vendors submit books/merchandise from the public,
no-login `/author/submit` form — title, description, category, an
optional cover image, and a suggested retail price (the platform's
wholesale cost, 65% of that, is computed automatically and can't be
overridden). Each pending submission shows **Approve** and **Decline**:

- **Approve** finds or creates a real account for the author (Supabase's
  own invite-by-email — a different email than Resend's confirmation
  emails, so it needs the Supabase project's own auth email set up to
  actually arrive), adds the item to the catalog at its price/computed
  wholesale cost, and links the submission to both. From there it's an
  ordinary catalog item — allocate it to a fair like anything else.
- **Decline** takes an optional note (shown back to the author on their
  own dashboard once they have one) and doesn't touch the catalog.

A submitter who already has an author account (from a prior approval)
can skip the public form and submit again from `/author/submit` while
signed in — it pre-fills their name/email and links the new submission to
their account immediately, without waiting for another approval. A
submission made by an admin "viewing as" that author (see below) is
flagged inline the same way an admin-submitted fair request is.

### Viewing as an org or author (`/admin/organizations`, `/admin/authors`)

Each row on either list has a **View as** link — switches your admin
session into that org's `/org` or that author's `/author` portal, so you
can see (and, for support/onboarding, act on) exactly what they would.
An amber banner stays visible the whole time so it's never mistaken for
your own admin session, with a **Stop viewing as** link to switch back.

This is **not** a real login as that org/author — you never hold their
actual credentials, and nothing about their real account changes. It's a
scoped preview: your own admin session renders the org/author portal as
if you were them, and any action you take there (submitting a fair
request, submitting an item) is recorded truthfully as admin-submitted
on their behalf, not silently attributed to them as if they'd typed it
themselves. `/admin/fair-requests` and `/admin/author-submissions` both
flag rows created this way.

### Payments

The payment webhook (`/api/webhooks/stripe`) and its sale-writing
functions handle four ways to pay, all writing through the same
channel-agnostic `record_sale()`/ledger core — none of them are
second-class:

1. **Card, in person** — `/admin/fairs/<id>/checkout`. Build a cart from
   that fair's available-to-sell stock, click "Connect reader" once, then
   "Charge $X with reader" — creates the `checkout_sessions` row and
   PaymentIntent, collects payment on the physical reader, and the
   webhook finalizes the sale asynchronously once Stripe confirms it (the
   screen polls briefly and shows "Sale recorded" when it lands). Needs
   "Terminal setup" done first — see above. This screen is admin-only for
   now — there's no separate org-staff login yet, so it isn't scoped to
   "whoever is running the booth" the way an eventual volunteer checkout
   would be.
2. **Card, online** — the public storefront, `/fairs/<id>` (no login).
   Buyers browse that fair's allocated stock and pay with Stripe Elements
   as a guest. Orders are for **pickup at the fair, not shipped** — see
   "Order pickup" below.
3. **Student wallet** — a parent-funded balance a student spends down
   themselves at the checkout table. See "Student wallets" below.
4. **Cash** — recorded the same as before (`channel = cash`), no reader or
   online step involved.

Card-in-person, online, and wallet spends all funnel into the same
`payment_intent.succeeded` webhook handler (cash doesn't, since there's no
PaymentIntent for cash at all) — it tells apart a cart checkout from a
wallet funding by a `kind` tag in the PaymentIntent's metadata, set when
each is created.

### Order pickup (`/admin/fairs/<id>/pickup`)

Every online order is for pickup during the fair, not shipping — search
by the buyer's name or email, see the actual titles they bought (not just
a count), and **Mark picked up** once you've handed it over. Buyers get a
confirmation email (Resend) with their order code as backup, but the app
never depends on it arriving — their confirmation page, or
`/fairs/<id>/orders` (looks orders up by email) if they lose that too, are
the reliable paths.

### Student wallets (`/admin/fairs/<id>/wallets`, schools only)

Only available for organizations marked "a school" (see "Editing an
organization" above). A parent loads money onto a named student's balance
from `/fairs/<id>/wallet` (public, no login) — quick $10/$20/$50 buttons
or any amount, paid via Stripe Elements same as the storefront, with a
confirmation email sent to the parent. The student then spends it down
**themselves**, with no login either: at `/admin/fairs/<id>/checkout`,
search the wallet section by the student's name, pick the matching
student (grade/teacher shown to tell apart same-name students), and
charge the cart to that balance — same identity approach as Scholastic's
own eWallet (a name/grade/teacher lookup, not a PIN or account).
Overdrawing a wallet is rejected outright.

Unspent balance does **not** refund to the parent or roll over to next
year — from the wallets page, **"Close eWallets for this fair"** sweeps
every remaining balance into that fair's org payout as additional
revenue, and is irreversible. Do this once the fair's pickup window has
ended.

### Closing a fair (`/admin/fairs/<id>/edit`, "Settlement" card)

A real settlement is computed here — not just spec — but deliberately
scoped down from the full design below; read "Not yet supported" for
exactly what's missing. **"Close this fair"** computes and locks it in
one irreversible step:

- **Payout due**: the card/online (and wallet) margin the org has earned
  so far, read straight off the ledger.
- **Cash wholesale owed**: the wholesale cost of every cash sale recorded
  for this fair — orgs keep the cash they collect directly, so they owe
  the platform the wholesale portion, netted here rather than collected
  separately.
- **Equipment rental fee**: whatever was set when the reader option was
  approved (or later, on this same page) — netted against payout the same
  way.
- **Net payout**: payout due minus everything owed.

Once closed, the figures are shown right there on the edit page (and on
the org's own dashboard, as a "Payout"/"Owe" column), along with a button
to actually move the money:

- **Positive net payout** (the org is owed money): **"Send $X payout via
  Stripe"** fires a real Stripe Transfer to the org's connected Express
  account. Disabled with an explanation if that org hasn't finished
  Stripe Connect onboarding yet, or if their payouts aren't enabled —
  finish that first (see "Editing an organization" above). Once sent, it
  shows **"✅ Payout confirmed"** — Transfers move funds between Stripe
  balances, so success is known immediately, not something to wait on.
  If it's ever later reversed (a dispute clawback — rare), that shows
  here too as **"⚠️ Transfer was reversed."**
- **Negative net payout** (the org owes the platform): **"Create $X
  payment link"** generates a one-time Stripe Payment Link and emails it
  to the org's contact address, for them to pay directly. It shows
  **"⏳ Awaiting payment"** with the link until the org actually pays,
  then flips to **"✅ Paid on <date>"** automatically — both the org and
  the admin get a confirmation email at that point too.

Either button can only be clicked once per settlement — there's no
"resend" or "undo." The "awaiting payment" → "paid" transition depends
on the Stripe webhook being subscribed to `checkout.session.completed`
(see "Stripe setup" in the README) — without it, a link that's actually
been paid will keep showing as awaiting payment.

**Missing-inventory cost is always $0** — there's no returns-recording
feature yet to compute it from, so nothing is billed for stock that
never comes back. A refund requested after a fair has closed does not
reopen the settlement — that part of the full design also isn't built
yet (see "Not yet supported").

## Org staff guide

The org portal (`/org`) is real and working for the two things below.
Running checkout, a live sales feed, and payout status are **not** part
of it yet — those screens are still admin-only (see "Payments" above);
this section describes what's actually built today, not the eventual
full scope.

### Your dashboard (`/org`)

Lists your organization's fairs (with a shareable link to the public
storefront and/or student-wallet page for each, if those options are
enabled) and your fair requests with their current status (pending,
approved, declined — with the admin's note if declined).

### Requesting a fair (`/org/fairs/request`)

Fill in a name and dates, then choose which payment options you want —
each has an explanation right below its checkbox so you know what you're
picking before you submit, not after:

- **In-person card reader** — a physical Stripe Terminal reader at your
  table, on by default.
- **Online storefront** — a public link buyers can browse and pay from
  ahead of time, for pickup at the fair, on by default.
- **Student wallets** — only offered (and only selectable) if your
  organization is marked "a school"; parents load money onto a named
  student's balance and the student spends it down themselves at
  checkout.
- **Cash** — on by default; captured as a flag but not enforced, since
  there's no cash-recording screen yet either way.

An equipment rental fee applies if you choose the in-person reader — set
by the admin at approval, netted against your payout when the fair
closes, not something you set yourself.

Submitting creates a `fair_requests` row for an admin to review — you
can't approve your own request. Once approved, you'll get an email
pointing you back to `/org`, and it becomes a real fair with those same
payment options (an admin can still adjust them afterward from the
fair's edit page).

### Your payout

Once an admin closes a fair (see the admin guide's "Closing a fair"),
your dashboard's fairs table shows a **Payout** column — a dollar amount
if you're owed money, or "Owe $X" if cash sales and/or an equipment
rental fee outweighed your card/online margin. Moving the money is a
button on the admin's end, not automatic on close — if you're owed
money, it arrives as a transfer to your organization's connected Stripe
account (once Stripe Connect onboarding is finished), shown as "✅ Sent"
once it does; if you owe money, you'll get an email with a link to pay
it directly, and the column shows "⏳ Awaiting payment" until you do,
then "✅ Paid" (with another email confirming it) once you have.

## Buyer guide

Browse a fair's storefront at `/fairs/<id>` (scoped to that specific
fair — you won't see other orgs' inventory) — cover images, a search box,
a category filter, and a sort order (title or price); a "↻ Refresh
availability" button reloads the counts if you've had the page open a
while. Add items to your cart, and check out with a card as a guest — no
account needed, just your name and email. **Orders are for pickup at the
fair, not shipped.** After paying, your confirmation page shows an order
code, and a confirmation email is sent too — but treat both as backup,
not guaranteed: if you lose them, `/fairs/<id>/orders` looks your order(s)
up again by the email you used at checkout.

If your student's school offers **student wallets**, you can instead load
money onto your kid's own balance at `/fairs/<id>/wallet` (only shown for
schools, with quick $10/$20/$50 buttons or any amount you choose) so they
can shop the fair independently, without carrying cash — they spend it
down themselves at the checkout table by giving their name. Any amount
left unspent after the fair becomes an additional donation toward the
school — **it isn't refunded or carried over to next time**. Once the
fair closes out its wallets, you'll get an email with a link to a
printable/downloadable receipt showing exactly what was donated.

Promotions/bundle discounts, when the org running the fair has set any
up, apply **automatically** at checkout — you don't enter a code or
choose anything, the discount is just reflected in your total.

## Author guide

Submit a book or piece of merchandise for EasyBookFair to carry at
`/author/submit` — no account needed the first time. Give your name,
email, a title, and a **suggested retail price**; the page shows you the
wholesale price you'd be paid per unit as you type (65% of retail,
computed automatically — you can't set it independently).

A platform admin reviews every submission. If approved:

- You'll get an email to set up a real account (a different email from
  the rest of this app's — it's Supabase's own account-invite flow, not
  Resend).
- Your item joins the platform catalog at the price/wholesale cost you
  submitted, ready to be allocated to a fair like anything else.
- Signing in takes you to `/author`, which lists everything you've
  submitted with its review status, and — once an item is actually
  allocated to a fair and selling — how many units have sold and how much
  you've earned so far.

Already have an account? `/author/submit` recognizes you when signed in
and pre-fills your name/email — no need to wait for another approval to
submit something new.

## Not yet supported

- Sales tax calculation or remittance.
- Chargeback/dispute reconciliation beyond a basic refund.
- Tap to Pay (iPhone/Android) and Bluetooth readers (M2, Chipper) — both
  need Stripe's native mobile Terminal SDK, which this web app can't
  invoke from a browser.
- Running checkout or a live sales feed from the org portal — those stay
  admin-only for now (see "Org staff guide" above); payout status is
  built (see "Your payout"), just not those two.
- Self-serve invites for platform admins or org staff — both are added
  directly in the database by an existing admin. (Author accounts are
  different — created automatically on approval, no manual step.)
- Missing-inventory cost as part of closing a fair (needs a
  returns-recording feature this app doesn't have yet — see "Closing a
  fair").
- A returns/manifest workflow at all — `allocations.quantity_returned`
  exists in the schema but nothing in the app writes to it yet.

These are called out as deferred, not silently missing.
