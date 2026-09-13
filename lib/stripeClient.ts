import { loadStripe, type Stripe } from "@stripe/stripe-js";

// Client-side counterpart to lib/stripe.ts's server-side singleton — the
// buyer-facing storefront/wallet pages need Stripe.js (Elements) in the
// browser, which uses the publishable key, never the secret key.
let stripePromise: Promise<Stripe | null> | null = null;

export function getStripeClient() {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      throw new Error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set");
    }
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}
