import Stripe from "stripe";

// Server-only. The platform is the merchant of record (docs/spec.md,
// "Stripe Connect, separate-charges-and-transfers model") — this is the
// platform's own Stripe account, never a connected account's key.
let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (!cached) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    cached = new Stripe(secretKey);
  }
  return cached;
}
