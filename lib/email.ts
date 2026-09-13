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
