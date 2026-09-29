import disposableDomains from "disposable-email-domains/index.json";

// A free, maintained list of known temp-mail/burner-email domains
// (mailinator, guerrillamail, etc.) — no external API, no cost, no
// account creation needed. Catches a real human using a throwaway
// address, which a bot-detection widget (lib/turnstile.ts) can't.
const disposableDomainSet = new Set(disposableDomains as string[]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1];
  return !!domain && disposableDomainSet.has(domain);
}
