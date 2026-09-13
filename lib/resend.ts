import { Resend } from "resend";

// Server-only, mirrors lib/stripe.ts's singleton pattern.
let cached: Resend | null = null;

export function getResend(): Resend {
  if (!cached) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not set");
    }
    cached = new Resend(apiKey);
  }
  return cached;
}
