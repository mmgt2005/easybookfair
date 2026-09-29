// Cloudflare Turnstile — a free, privacy-friendly bot-check widget shown
// on public forms (org signup, author submission, checkout, wallet/pool
// donations). Verification is server-side: the widget hands the browser
// a one-time token, which the Server Action posts here to Cloudflare's
// own siteverify endpoint before trusting the submission.
//
// If TURNSTILE_SECRET_KEY isn't set (e.g. local dev without Cloudflare
// keys configured), verification is skipped entirely rather than
// blocking every submission — matches this app's existing pattern for
// optional third-party services (RESEND_API_KEY missing just means no
// emails send, not a hard failure).
export async function verifyTurnstileToken(
  token: string | null,
  remoteIp?: string,
): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) return true;
  if (!token) return false;

  const body = new URLSearchParams({ secret: secretKey, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    // A network hiccup talking to Cloudflare shouldn't be indistinguishable
    // from "this is spam" — fail open, same posture as the missing-key case.
    return true;
  }
}
