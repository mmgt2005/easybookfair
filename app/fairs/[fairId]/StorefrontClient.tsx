"use client";

import { useState, type FormEvent } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { getStripeClient } from "@/lib/stripeClient";
import { createGuestCheckout } from "./actions";
import { Button, Card, Input } from "@/components/ui";

type Item = {
  catalog_item_id: string;
  title: string;
  price: number;
  image_url: string | null;
  description: string | null;
  available: number;
};

export function StorefrontClient({ fairId, items }: { fairId: string; items: Item[] }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [checkout, setCheckout] = useState<{
    checkoutSessionId: string;
    clientSecret: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const total = items.reduce(
    (sum, item) => sum + (cart[item.catalog_item_id] ?? 0) * item.price,
    0,
  );

  function updateQty(catalogItemId: string, qty: number) {
    setCart((prev) => {
      const next = { ...prev };
      if (!Number.isFinite(qty) || qty <= 0) {
        delete next[catalogItemId];
      } else {
        next[catalogItemId] = qty;
      }
      return next;
    });
  }

  async function handleCheckout(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const lines = Object.entries(cart).map(([catalog_item_id, quantity]) => ({
      catalog_item_id,
      quantity,
    }));
    if (lines.length === 0) {
      setError("Your cart is empty");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createGuestCheckout(fairId, lines, buyerName, buyerEmail);
      setCheckout(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (checkout) {
    return (
      <Elements stripe={getStripeClient()} options={{ clientSecret: checkout.clientSecret }}>
        <PaymentForm fairId={fairId} checkoutSessionId={checkout.checkoutSessionId} />
      </Elements>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
              <th className="py-2 pl-4 pr-4">Item</th>
              <th className="py-2 pr-4">Price</th>
              <th className="py-2 pr-4">Available</th>
              <th className="py-2 pr-4">Qty</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.catalog_item_id} className="border-b border-neutral-50 last:border-0">
                <td className="py-2 pl-4 pr-4 font-semibold text-neutral-800">{item.title}</td>
                <td className="py-2 pr-4">${item.price.toFixed(2)}</td>
                <td className="py-2 pr-4">{item.available}</td>
                <td className="py-2 pr-4">
                  <Input
                    type="number"
                    min={0}
                    max={item.available}
                    value={cart[item.catalog_item_id] ?? 0}
                    onChange={(e) => updateQty(item.catalog_item_id, Number(e.target.value))}
                    className="w-20 px-2 py-1"
                  />
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 pl-4 text-neutral-500">
                  Nothing available to buy online right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="max-w-sm">
        <h2 className="font-heading font-bold text-neutral-900">Your order</h2>
        <p className="mb-3 mt-1 text-xs text-neutral-500">
          Pick up your order during the fair&apos;s allotted pickup time — nothing ships. Bring
          your name and this confirmation.
        </p>
        <p className="mb-3 font-semibold text-neutral-900">Total: ${total.toFixed(2)}</p>
        <form onSubmit={handleCheckout} className="flex flex-col gap-2">
          <Input
            placeholder="Your name"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            required
          />
          <Input
            type="email"
            placeholder="Your email"
            value={buyerEmail}
            onChange={(e) => setBuyerEmail(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={submitting || total <= 0}>
            {submitting ? "Preparing checkout…" : `Pay $${total.toFixed(2)}`}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function PaymentForm({
  fairId,
  checkoutSessionId,
}: {
  fairId: string;
  checkoutSessionId: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/fairs/${fairId}/order/${checkoutSessionId}`,
      },
    });

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed");
      setSubmitting(false);
    }
    // On success, Stripe redirects to return_url — nothing else to do here.
  }

  return (
    <Card className="max-w-sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <PaymentElement />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={!stripe || submitting}>
          {submitting ? "Processing…" : "Complete payment"}
        </Button>
      </form>
    </Card>
  );
}
