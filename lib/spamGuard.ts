import { verifyTurnstileToken } from "./turnstile";
import { isDisposableEmail } from "./disposableEmail";

export type SpamCheck =
  | { blocked: false }
  // A tripped honeypot means a bot filled in a field real users never see
  // — callers should fail *silently* (redirect to the same success page a
  // real submission would reach, or for a programmatic call with no
  // "silent success" concept, a plain generic error is fine) rather than
  // reveal that a trap exists.
  | { blocked: true; silent: true }
  | { blocked: true; silent: false; message: string };

// Shared anti-spam gate for EasyBookFair's public, no-login forms (org
// signup, author submission, guest checkout, wallet/pool donations).
// Three independent, low-cost layers, each optional/best-effort on its
// own: a bot-check widget (lib/turnstile.ts, no-ops if unconfigured), a
// known-disposable-email blocklist (lib/disposableEmail.ts, no external
// API), and a honeypot field. Combined into one call so every form
// checks the same things the same way.
export async function checkForSpam({
  turnstileToken,
  email,
  honeypot,
}: {
  turnstileToken: string | null;
  email: string;
  honeypot: string | null;
}): Promise<SpamCheck> {
  if (honeypot) {
    return { blocked: true, silent: true };
  }

  if (isDisposableEmail(email)) {
    return {
      blocked: true,
      silent: false,
      message: "Please use a non-disposable email address.",
    };
  }

  const verified = await verifyTurnstileToken(turnstileToken);
  if (!verified) {
    return {
      blocked: true,
      silent: false,
      message: "Verification failed — please try again.",
    };
  }

  return { blocked: false };
}
