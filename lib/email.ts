import { getResend } from "./resend";

// Called from the payment webhook, after the corresponding RPC has already
// committed — a failed send here must never fail the webhook itself (that
// would make Stripe retry an event that's already fully processed), so
// callers wrap these in try/catch and only log failures. Best-effort, not
// part of the payment's correctness guarantee.

function emailFrom(): string {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error("EMAIL_FROM is not set");
  }
  return from;
}

// Absolute base URL for links inside emails, and for QR codes/copyable
// links on the org marketing toolkit (app/org/fairs/[fairId]/marketing) —
// these are built from Server Components/Actions with no browser `window`
// to read an origin from. VERCEL_URL is deliberately checked *after*
// VERCEL_PROJECT_PRODUCTION_URL: VERCEL_URL is the current deployment's
// own unique URL (e.g. easybookfair-abc123.vercel.app), which Vercel's
// Deployment Protection commonly puts behind a login wall even for
// production deployments — a QR code or email link built from it would
// send a buyer to that login page instead of the real page. Vercel's
// production URL alias (the custom domain if one's set as primary,
// otherwise the project's stable .vercel.app domain) isn't behind that
// wall. Override either with NEXT_PUBLIC_SITE_URL for a custom domain or
// local testing against a tunnel.
export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function sendOrderConfirmationEmail(params: {
  to: string;
  buyerName: string | null;
  fairName: string;
  orderCode: string;
  orderUrl: string;
  lineItems: { title: string; quantity: number; price_charged: number }[];
}) {
  const total = params.lineItems.reduce((sum, l) => sum + l.quantity * l.price_charged, 0);
  const itemsHtml = params.lineItems
    .map(
      (l) =>
        `<li>${l.quantity}× ${l.title} — $${(l.quantity * l.price_charged).toFixed(2)}</li>`,
    )
    .join("");

  await getResend().emails.send({
    from: emailFrom(),
    to: params.to,
    subject: `Order confirmed — ${params.fairName}`,
    html: `
      <p>Hi ${params.buyerName || "there"},</p>
      <p>Your order for <strong>${params.fairName}</strong> is confirmed. Order code:
      <strong>${params.orderCode}</strong></p>
      <ul>${itemsHtml}</ul>
      <p><strong>Total: $${total.toFixed(2)}</strong></p>
      <p>Pick up your order at the fair — nothing ships.
      <a href="${params.orderUrl}">View your order</a>.</p>
    `,
  });
}

// Sent when an admin approves a fair request — the requester's only way to
// find their org's dashboard again short of remembering the URL, since
// there's no site-wide "your organizations" landing page. Links straight to
// /org rather than /login: middleware sends an unauthenticated visitor to
// /login?next=/org automatically, and an already-signed-in one goes right
// through — either way this is the correct link, not a login-flow one.
export async function sendFairApprovedEmail(params: {
  to: string;
  fairName: string;
  startDate: string;
  endDate: string;
}) {
  await getResend().emails.send({
    from: emailFrom(),
    to: params.to,
    subject: `Your fair "${params.fairName}" was approved 🎉`,
    html: `
      <p>Good news — <strong>${params.fairName}</strong>
      (${params.startDate} – ${params.endDate}) has been approved and is now
      scheduled.</p>
      <p><a href="${siteUrl()}/org">Sign in to your dashboard</a> to see it,
      share its buyer links, and track requests for future fairs.</p>
    `,
  });
}

// Sent when an admin approves an org's event request (author reading /
// book signing) — does NOT go to the author (out of scope; the admin
// coordinates the actual reading/signing with them directly, using the
// author info shown on the admin review page). Mirrors
// sendFairApprovedEmail: best-effort, links to /org, no attachment.
export async function sendEventRequestApprovedEmail(params: {
  to: string;
  fairName: string;
  bookTitle: string;
  eventType: "author_reading" | "book_signing";
  requestedDate: string | null;
}) {
  const eventLabel = params.eventType === "author_reading" ? "author reading" : "book signing";
  await getResend().emails.send({
    from: emailFrom(),
    to: params.to,
    subject: `Your ${eventLabel} request was approved 🎉`,
    html: `
      <p>Good news — your ${eventLabel} for <strong>${params.bookTitle}</strong>
      at <strong>${params.fairName}</strong>
      ${params.requestedDate ? `(requested for ${params.requestedDate})` : "(date still to be scheduled)"}
      has been approved.</p>
      <p>A platform admin will follow up directly to coordinate the details.</p>
      <p><a href="${siteUrl()}/org">Sign in to your dashboard</a> to track it.</p>
    `,
  });
}

// Sent when an admin closes out a fair's wallets (close_wallets_for_fair,
// migration 0022/0037) — the parent's only notice that their child's
// unspent balance became a donation to the org rather than a refund. Links
// to a printable receipt page rather than attaching a PDF, keeping this
// consistent with every other "no PDF generation" choice in the app;
// browser print-to-PDF covers "download" well enough for a book fair's
// scale.
export async function sendWalletDonationReceiptEmail(params: {
  to: string;
  studentName: string;
  fairName: string;
  donatedAmount: number;
  receiptUrl: string;
}) {
  await getResend().emails.send({
    from: emailFrom(),
    to: params.to,
    subject: `${params.studentName}'s leftover wallet balance — ${params.fairName}`,
    html: `
      <p>${params.fairName} has wrapped up, and ${params.studentName} had
      <strong>$${params.donatedAmount.toFixed(2)}</strong> left in their
      wallet.</p>
      <p>As shared when the wallet was funded, unspent balance isn't
      refunded — it becomes an additional donation toward the
      organization. Thank you!</p>
      <p><a href="${params.receiptUrl}">View or print a receipt</a> for your
      records.</p>
    `,
  });
}

// Sent after an admin sends a settlement payout via Stripe Transfer
// (app/admin/fairs/actions.ts, sendSettlementPayout) — a receipt, not a
// notice they need to act on (unlike the payment-link email below).
export async function sendSettlementPayoutEmail(params: {
  to: string;
  fairName: string;
  amount: number;
}) {
  await getResend().emails.send({
    from: emailFrom(),
    to: params.to,
    subject: `Payout sent — ${params.fairName}`,
    html: `
      <p>Your payout of <strong>$${params.amount.toFixed(2)}</strong> for
      <strong>${params.fairName}</strong> has been sent to your connected
      Stripe account.</p>
      <p>It should reach your bank on Stripe's normal payout schedule for
      your account — check your Stripe dashboard for the exact timing.</p>
    `,
  });
}

// Sent after an admin creates a settlement payment link (the org owes the
// platform net) — this one the org does need to act on, so it's the
// primary way they'd ever see the link, not just a courtesy copy.
export async function sendSettlementPaymentLinkEmail(params: {
  to: string;
  fairName: string;
  amount: number;
  paymentLinkUrl: string;
}) {
  await getResend().emails.send({
    from: emailFrom(),
    to: params.to,
    subject: `Amount due — ${params.fairName}`,
    html: `
      <p><strong>${params.fairName}</strong> has closed out, and your
      organization owes <strong>$${params.amount.toFixed(2)}</strong>
      (cash sales collected directly, plus any equipment rental fee,
      exceeded your card/online payout).</p>
      <p><a href="${params.paymentLinkUrl}">Pay $${params.amount.toFixed(2)}
      now</a> to settle up.</p>
    `,
  });
}

// Sent from the payment webhook once a settlement payment link is
// actually paid (checkout.session.completed) — a receipt confirming the
// balance is settled, not something the org needs to act on (unlike the
// payment-link email above, which is the ask to pay).
export async function sendSettlementCollectedEmail(params: {
  to: string;
  fairName: string;
  amount: number;
}) {
  await getResend().emails.send({
    from: emailFrom(),
    to: params.to,
    subject: `Payment received — ${params.fairName}`,
    html: `
      <p>We've received your payment of <strong>$${params.amount.toFixed(2)}</strong>
      for <strong>${params.fairName}</strong>. Your settlement is fully paid —
      thank you!</p>
    `,
  });
}

export async function sendWalletFundingEmail(params: {
  to: string;
  studentName: string;
  fairName: string;
  amount: number;
}) {
  await getResend().emails.send({
    from: emailFrom(),
    to: params.to,
    subject: `Wallet funded for ${params.studentName} — ${params.fairName}`,
    html: `
      <p>You added <strong>$${params.amount.toFixed(2)}</strong> to
      ${params.studentName}'s wallet for <strong>${params.fairName}</strong>.</p>
      <p>${params.studentName} can spend it at the checkout table by giving their name.</p>
      <p>Any amount left unspent after the fair becomes an additional donation toward the
      school — it does not roll over or refund.</p>
    `,
  });
}

export async function sendPoolDonationEmail(params: {
  to: string;
  fairName: string;
  amount: number;
}) {
  await getResend().emails.send({
    from: emailFrom(),
    to: params.to,
    subject: `Thank you for your donation — ${params.fairName}`,
    html: `
      <p>Thank you for donating <strong>$${params.amount.toFixed(2)}</strong> to the
      wallet assistance pool for <strong>${params.fairName}</strong>.</p>
      <p>This isn't tied to one student — it automatically helps cover part of a purchase for
      any student who doesn't have enough of their own wallet balance at checkout.</p>
      <p>Any amount left unspent after the fair becomes an additional donation toward the
      school — it does not roll over or refund.</p>
    `,
  });
}
