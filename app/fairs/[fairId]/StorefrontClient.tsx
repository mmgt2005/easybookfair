"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { getStripeClient } from "@/lib/stripeClient";
import { createGuestCheckout } from "./actions";
import { applyPromotions, type ActivePromotion, type CatalogPriceInfo } from "@/lib/promotions";
import { Button, Card, Input, Select } from "@/components/ui";

type Item = {
  catalog_item_id: string;
  title: string;
  price: number;
  image_url: string | null;
  description: string | null;
  category: string | null;
  available: number;
};

type SortKey = "title" | "price-asc" | "price-desc";

export function StorefrontClient({
  fairId,
  items,
  promotions,
}: {
  fairId: string;
  items: Item[];
  promotions: ActivePromotion[];
}) {
  const router = useRouter();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<SortKey>("title");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [checkout, setCheckout] = useState<{
    checkoutSessionId: string;
    clientSecret: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category).filter((c): c is string => !!c))).sort(),
    [items],
  );

  const visibleItems = useMemo(() => {
    let filtered = items;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((i) => i.title.toLowerCase().includes(q));
    }
    if (category) {
      filtered = filtered.filter((i) => i.category === category);
    }
    const sorted = [...filtered];
    if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "price-asc") sorted.sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") sorted.sort((a, b) => b.price - a.price);
    return sorted;
  }, [items, search, category, sort]);

  // Cost is irrelevant to a price preview (only price_charged is displayed
  // here) — 0 is a safe placeholder, never sent anywhere; createGuestCheckout
  // (app/fairs/[fairId]/actions.ts) looks up the real wholesale_cost again
  // server-side when the order is actually placed.
  const catalogById = useMemo(() => {
    const map = new Map<string, CatalogPriceInfo>();
    for (const item of items) {
      map.set(item.catalog_item_id, { price: item.price, cost: 0 });
    }
    return map;
  }, [items]);

  const cartLines = useMemo(
    () => Object.entries(cart).map(([catalog_item_id, quantity]) => ({ catalog_item_id, quantity })),
    [cart],
  );

  // Preview only — the same applyPromotions() call createGuestCheckout()
  // makes when the order is actually placed (lib/promotions.ts), so the
  // cart shown here matches what the buyer is really charged instead of
  // silently pricing from full catalog price.
  const pricedLines = useMemo(
    () => applyPromotions(cartLines, catalogById, promotions),
    [cartLines, catalogById, promotions],
  );

  const total = pricedLines.reduce((sum, line) => sum + line.price_charged * line.quantity, 0);

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
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex-1">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search titles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-[12rem]"
          />
          {categories.length > 0 && (
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-auto"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="w-auto"
          >
            <option value="title">Title A–Z</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => router.refresh()}
            title="Reload availability in case someone else just bought the last copy"
          >
            ↻ Refresh availability
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {visibleItems.map((item) => (
            <Card key={item.catalog_item_id} className="flex flex-col gap-2 p-3">
              <div className="aspect-square w-full overflow-hidden rounded-lg bg-neutral-100">
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl">
                    📖
                  </div>
                )}
              </div>
              <p className="text-sm font-semibold leading-snug text-neutral-800">{item.title}</p>
              <p className="text-xs text-neutral-500">{item.available} available</p>
              <p className="font-semibold text-neutral-900">${item.price.toFixed(2)}</p>
              <Input
                type="number"
                min={0}
                max={item.available}
                value={cart[item.catalog_item_id] ?? 0}
                onChange={(e) => updateQty(item.catalog_item_id, Number(e.target.value))}
                className="w-full px-2 py-1"
              />
            </Card>
          ))}
          {visibleItems.length === 0 && (
            <p className="col-span-full py-4 text-neutral-500">
              {items.length === 0
                ? "Nothing available to buy online right now."
                : "No items match your search."}
            </p>
          )}
        </div>
      </div>

      <Card className="w-full lg:sticky lg:top-6 lg:max-w-sm">
        <h2 className="font-heading font-bold text-neutral-900">Your order</h2>
        <p className="mb-3 mt-1 text-xs text-neutral-500">
          Pick up your order during the fair&apos;s allotted pickup time — nothing ships. Bring
          your name and this confirmation.
        </p>
        <ul className="mb-3 flex flex-col gap-1 text-sm">
          {pricedLines.map((line, i) => {
            const item = items.find((it) => it.catalog_item_id === line.catalog_item_id);
            if (!item) return null;
            const discounted = line.promotion_id !== null;
            return (
              <li key={`${line.catalog_item_id}-${i}`} className="flex justify-between">
                <span>
                  {line.quantity}× {item.title}
                  {discounted && (
                    <span className="ml-1 text-xs font-semibold text-accent-600">🏷️ discount</span>
                  )}
                </span>
                <span>${(line.quantity * line.price_charged).toFixed(2)}</span>
              </li>
            );
          })}
        </ul>
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
