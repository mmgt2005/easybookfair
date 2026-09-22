// Single source of truth for which fair.status values the public
// storefront and wallet-funding pages/actions are open during — kept here
// so the page-level gate (what a visitor sees) and the Server Action's own
// re-check (what actually lets money move) can never drift apart. See
// app/api/cron/transition-fairs/route.ts for what drives status through
// scheduled -> active -> return_window in the first place.
export type FairStatus = "scheduled" | "active" | "return_window" | "closed";

// Storefront ordering only makes sense once the fair is actually open —
// not before (nothing's been set out yet) and not after (the on-site
// event is over; return_window is for returning unsold stock, not more
// selling).
export function fairAllowsStorefront(status: FairStatus): boolean {
  return status === "active";
}

// Wallet funding is allowed a wider window: parents commonly want to
// pre-load a student's wallet before the fair opens so there's money
// ready on day one, so scheduled is included alongside active. It stops
// once return_window begins, since spending is over at that point.
export function fairAllowsWalletFunding(status: FairStatus): boolean {
  return status === "scheduled" || status === "active";
}
