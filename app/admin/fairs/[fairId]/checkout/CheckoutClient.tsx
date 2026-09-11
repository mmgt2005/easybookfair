"use client";

import { useRef, useState } from "react";
import { loadStripeTerminal, type Reader, type Terminal } from "@stripe/terminal-js";
import { createInPersonCheckout, getCheckoutSessionStatus } from "./actions";
import { Button, Card, Input } from "@/components/ui";

type Item = { catalog_item_id: string; title: string; price: number; available: number };

type TerminalStatus = "idle" | "connecting" | "connected" | "error";

export function CheckoutClient({
  fairId,
  items,
  terminalLocationId,
}: {
  fairId: string;
  items: Item[];
  terminalLocationId: string | null;
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [terminalStatus, setTerminalStatus] = useState<TerminalStatus>("idle");
  const [discoveredReaders, setDiscoveredReaders] = useState<Reader[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [charging, setCharging] = useState(false);
  const terminalRef = useRef<Terminal | null>(null);

  const total = items.reduce(
    (sum, item) => sum + (cart[item.catalog_item_id] ?? 0) * item.price,
    0,
  );

  async function getTerminal(): Promise<Terminal> {
    if (terminalRef.current) return terminalRef.current;

    const StripeTerminal = await loadStripeTerminal();
    if (!StripeTerminal) {
      throw new Error("Failed to load the Stripe Terminal SDK");
    }

    const terminal = StripeTerminal.create({
      onFetchConnectionToken: async () => {
        const res = await fetch("/api/terminal/connection-token", { method: "POST" });
        if (!res.ok) {
          throw new Error("Could not fetch a Terminal connection token");
        }
        const data = (await res.json()) as { secret: string };
        return data.secret;
      },
      onUnexpectedReaderDisconnect: () => {
        setTerminalStatus("idle");
        setMessage("Reader disconnected unexpectedly — reconnect before charging again.");
      },
    });

    terminalRef.current = terminal;
    return terminal;
  }

  async function connectToReader(terminal: Terminal, reader: Reader) {
    const result = await terminal.connectReader(reader);
    if ("error" in result) {
      setTerminalStatus("error");
      setMessage(result.error.message);
      return;
    }
    setTerminalStatus("connected");
    setMessage(`Connected to ${reader.label || reader.id}`);
  }

  async function discoverAndConnect() {
    if (!terminalLocationId) return;
    setTerminalStatus("connecting");
    setMessage(null);
    setDiscoveredReaders([]);

    try {
      const terminal = await getTerminal();
      const result = await terminal.discoverReaders({ location: terminalLocationId });
      if ("error" in result) {
        throw new Error(result.error.message);
      }
      if (result.discoveredReaders.length === 0) {
        setTerminalStatus("idle");
        setMessage(
          "No readers found — check the reader is powered on, online, and registered to this fair's Terminal location.",
        );
        return;
      }
      if (result.discoveredReaders.length === 1) {
        await connectToReader(terminal, result.discoveredReaders[0]);
      } else {
        setDiscoveredReaders(result.discoveredReaders);
        setTerminalStatus("idle");
      }
    } catch (err) {
      setTerminalStatus("error");
      setMessage(err instanceof Error ? err.message : "Failed to discover readers");
    }
  }

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

  async function waitForCompletion(checkoutSessionId: string) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const status = await getCheckoutSessionStatus(checkoutSessionId);
      if (status === "completed") return true;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return false;
  }

  async function charge() {
    const lines = Object.entries(cart).map(([catalog_item_id, quantity]) => ({
      catalog_item_id,
      quantity,
    }));
    if (lines.length === 0) {
      setMessage("Cart is empty");
      return;
    }

    setCharging(true);
    setMessage("Creating payment…");
    try {
      const terminal = await getTerminal();
      const { checkoutSessionId, clientSecret } = await createInPersonCheckout(fairId, lines);

      setMessage("Tap, insert, or swipe card on the reader…");
      const collectResult = await terminal.collectPaymentMethod(clientSecret);
      if ("error" in collectResult) {
        throw new Error(collectResult.error.message);
      }

      setMessage("Processing payment…");
      const processResult = await terminal.processPayment(collectResult.paymentIntent);
      if ("error" in processResult) {
        throw new Error(processResult.error.message);
      }

      setMessage("Payment collected — finalizing sale…");
      const completed = await waitForCompletion(checkoutSessionId);
      setMessage(
        completed
          ? "Sale recorded ✅"
          : "Payment succeeded — sale is still finalizing, check back shortly.",
      );
      setCart({});
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Charge failed");
    } finally {
      setCharging(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <Card className="flex-1 overflow-x-auto p-0">
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
                  Nothing available to sell — allocate stock to this fair first.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="w-full max-w-sm">
        <h2 className="font-heading font-bold text-neutral-900">Cart</h2>
        <ul className="my-3 flex flex-col gap-1 text-sm">
          {Object.entries(cart).map(([catalogItemId, qty]) => {
            const item = items.find((i) => i.catalog_item_id === catalogItemId);
            if (!item) return null;
            return (
              <li key={catalogItemId} className="flex justify-between">
                <span>
                  {qty}× {item.title}
                </span>
                <span>${(qty * item.price).toFixed(2)}</span>
              </li>
            );
          })}
          {Object.keys(cart).length === 0 && <li className="text-neutral-500">Empty</li>}
        </ul>
        <p className="mb-3 font-semibold text-neutral-900">Total: ${total.toFixed(2)}</p>

        {terminalLocationId && (
          <div className="mb-3 flex flex-col gap-2">
            {terminalStatus !== "connected" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={discoverAndConnect}
                disabled={terminalStatus === "connecting"}
              >
                {terminalStatus === "connecting" ? "Connecting…" : "Connect reader"}
              </Button>
            )}
            {discoveredReaders.length > 1 && terminalStatus !== "connected" && (
              <ul className="flex flex-col gap-1">
                {discoveredReaders.map((reader) => (
                  <li key={reader.id}>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const terminal = terminalRef.current;
                        if (terminal) void connectToReader(terminal, reader);
                      }}
                    >
                      {reader.label || reader.id}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Button
          type="button"
          disabled={!terminalLocationId || terminalStatus !== "connected" || charging || total <= 0}
          onClick={charge}
        >
          {charging ? "Charging…" : `Charge $${total.toFixed(2)} with reader`}
        </Button>

        {message && <p className="mt-3 text-sm text-neutral-700">{message}</p>}
      </Card>
    </div>
  );
}
