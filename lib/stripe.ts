import Stripe from "stripe";

// Server-only. The platform is the merchant of record (docs/spec.md,
// "Stripe Connect, separate-charges-and-transfers model") — this is the
// platform's own Stripe account, never a connected account's key.
let cached: Stripe | null = null;

// Pinned explicitly (the installed SDK's own type now requires it) rather
// than left to whatever the SDK defaults to, so an unrelated `npm install`
// can't silently change which Stripe API version this app talks to. Bump
// deliberately — alongside reviewing Stripe's API changelog — when
// upgrading the `stripe` package on purpose, not as a side effect of it.
const STRIPE_API_VERSION = "2026-08-26.dahlia";

export function getStripe(): Stripe {
  if (!cached) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    cached = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
  }
  return cached;
}

// Read from the key's own prefix, not a Stripe API call — Stripe key
// prefixes (sk_test_/sk_live_) are a reliable, well-documented signal of
// which mode a key belongs to, so this needs no network round trip.
// Surfaced to admins (the demo fair's enable/disable prompt) so a real
// card can't get charged against seeded demo data without them noticing
// live mode is active first.
export function stripeMode(): "test" | "live" | "unconfigured" {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return "unconfigured";
  if (secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_")) return "live";
  return "test";
}
