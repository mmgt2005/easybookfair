"use client";

import { useMemo, useRef, useState } from "react";
import { loadStripeTerminal, type Reader, type Terminal } from "@stripe/terminal-js";
import {
  createInPersonCheckout,
  getCheckoutSessionStatus,
  searchWallets,
  chargeWallet,
  chargeCash,
  createWalletAtCheckout,
  type WalletMatch,
} from "./actions";
import { applyPromotions, type ActivePromotion, type CatalogPriceInfo } from "@/lib/promotions";
import { Button, Card, Input } from "@/components/ui";
import { ScanInput } from "./ScanInput";

type Item = { catalog_item_id: string; title: string; price: number; available: number };

type TerminalStatus = "idle" | "connecting" | "connected" | "error";

export function CheckoutClient({
  fairId,
  items,
  terminalLocationId,
  allowWallet,
  allowCash,
  promotions,
}: {
  fairId: string;
  items: Item[];
  terminalLocationId: string | null;
  allowWallet: boolean;
  allowCash: boolean;
  promotions: ActivePromotion[];
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [terminalStatus, setTerminalStatus] = useState<TerminalStatus>("idle");
  const [discoveredReaders, setDiscoveredReaders] = useState<Reader[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [charging, setCharging] = useState(false);
  const [walletQuery, setWalletQuery] = useState("");
  const [walletMatches, setWalletMatches] = useState<WalletMatch[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<WalletMatch | null>(null);
  const [walletSearched, setWalletSearched] = useState(false);
  const [newWalletGrade, setNewWalletGrade] = useState("");
  const [newWalletTeacher, setNewWalletTeacher] = useState("");
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<{ catalogItemId: string; title: string } | null>(null);
  const terminalRef = useRef<Terminal | null>(null);

  // Cost is irrelevant to a price preview (only price_charged is displayed
  // here) — 0 is a safe placeholder, never sent anywhere; the real
  // wholesale_cost is looked up again server-side when the sale is charged.
  const catalogById = useMemo(() => {
    const map = new Map<string, CatalogPriceInfo>();
    for (const item of items) {
      map.set(item.catalog_item_id, { price: item.price, cost: 0 });
    }
    return map;
  }, [items]);

  const itemsById = useMemo(() => {
    const map = new Map<string, Item>();
    for (const item of items) map.set(item.catalog_item_id, item);
    return map;
  }, [items]);

  const cartLines = useMemo(
    () => Object.entries(cart).map(([catalog_item_id, quantity]) => ({ catalog_item_id, quantity })),
    [cart],
  );

  // Preview only — the same applyPromotions() call the server actions make
  // when a sale is actually charged (lib/promotions.ts), so what the
  // cashier sees here matches what the buyer is really charged instead of
  // silently pricing from full catalog price.
  const pricedLines = useMemo(
    () => applyPromotions(cartLines, catalogById, promotions),
    [cartLines, catalogById, promotions],
  );

  const total = pricedLines.reduce((sum, line) => sum + line.price_charged * line.quantity, 0);

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

  function handleScan(code: string) {
    const item = itemsById.get(code);
    if (!item) {
      setScanError(`No available item matches "${code}"`);
      setLastScan(null);
      return;
    }
    const currentQty = cart[item.catalog_item_id] ?? 0;
    if (currentQty >= item.available) {
      setScanError(`No more "${item.title}" available to add`);
      return;
    }
    setScanError(null);
    updateQty(item.catalog_item_id, currentQty + 1);
    setLastScan({ catalogItemId: item.catalog_item_id, title: item.title });
  }

  // Shared by the cart panel's +/- buttons and the scan handler above so a
  // mis-scan or a plain typo can be corrected without hunting for the row
  // in the (potentially long) item table.
  function adjustQty(catalogItemId: string, delta: number) {
    const item = itemsById.get(catalogItemId);
    const current = cart[catalogItemId] ?? 0;
    const max = item?.available ?? Infinity;
    updateQty(catalogItemId, Math.min(Math.max(current + delta, 0), max));
  }

  function undoLastScan() {
    if (!lastScan) return;
    adjustQty(lastScan.catalogItemId, -1);
    setLastScan(null);
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

  async function handleWalletSearch(q: string) {
    setWalletQuery(q);
    setSelectedWallet(null);
    setWalletSearched(false);
    if (q.trim().length < 2) {
      setWalletMatches([]);
      return;
    }
    try {
      const matches = await searchWallets(fairId, q);
      setWalletMatches(matches);
    } catch {
      setWalletMatches([]);
    } finally {
      setWalletSearched(true);
    }
  }

  async function handleCreateWallet() {
    if (!walletQuery.trim()) return;
    setCreatingWallet(true);
    setMessage(null);
    try {
      const wallet = await createWalletAtCheckout(
        fairId,
        walletQuery,
        newWalletGrade,
        newWalletTeacher,
      );
      setSelectedWallet(wallet);
      setWalletMatches([]);
      setWalletSearched(false);
      setNewWalletGrade("");
      setNewWalletTeacher("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't create wallet");
    } finally {
      setCreatingWallet(false);
    }
  }

  async function chargeSelectedWallet() {
    if (!selectedWallet) return;
    const lines = Object.entries(cart).map(([catalog_item_id, quantity]) => ({
      catalog_item_id,
      quantity,
    }));
    if (lines.length === 0) {
      setMessage("Cart is empty");
      return;
    }

    setCharging(true);
    setMessage("Charging wallet…");
    try {
      await chargeWallet(fairId, selectedWallet.id, lines);
      setMessage(`Charged $${total.toFixed(2)} to ${selectedWallet.student_name}'s wallet ✅`);
      setCart({});
      setSelectedWallet(null);
      setWalletQuery("");
      setWalletMatches([]);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Wallet charge failed");
    } finally {
      setCharging(false);
    }
  }

  async function chargeCashTender() {
    const lines = Object.entries(cart).map(([catalog_item_id, quantity]) => ({
      catalog_item_id,
      quantity,
    }));
    if (lines.length === 0) {
      setMessage("Cart is empty");
      return;
    }

    setCharging(true);
    setMessage("Recording cash sale…");
    try {
      await chargeCash(fairId, lines);
      setMessage(`Recorded $${total.toFixed(2)} cash sale ✅`);
      setCart({});
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Cash sale failed");
    } finally {
      setCharging(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <Card className="flex-1 overflow-x-auto p-0">
        <div className="border-b border-neutral-100 p-4">
          <ScanInput onScan={handleScan} />
          {scanError && <p className="mt-1 text-xs text-red-600">{scanError}</p>}
          {lastScan && !scanError && (
            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-neutral-600">
              <span>
                ✅ Added {lastScan.title} — qty {cart[lastScan.catalogItemId] ?? 0} in cart
              </span>
              <button
                type="button"
                onClick={undoLastScan}
                className="font-semibold text-accent-600 hover:underline"
              >
                Undo
              </button>
            </div>
          )}
        </div>
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
          {pricedLines.map((line, i) => {
            const item = items.find((it) => it.catalog_item_id === line.catalog_item_id);
            if (!item) return null;
            const discounted = line.promotion_id !== null;
            return (
              <li key={`${line.catalog_item_id}-${i}`} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => adjustQty(item.catalog_item_id, -1)}
                      aria-label={`Remove one ${item.title}`}
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-600 hover:bg-neutral-200"
                    >
                      −
                    </button>
                    <span className="w-4 text-center">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => adjustQty(item.catalog_item_id, 1)}
                      disabled={line.quantity >= item.available}
                      aria-label={`Add one ${item.title}`}
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-600 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      +
                    </button>
                  </span>
                  <span>
                    {item.title}
                    {discounted && (
                      <span className="ml-1 text-xs font-semibold text-accent-600">🏷️ discount</span>
                    )}
                  </span>
                </span>
                <span>${(line.quantity * line.price_charged).toFixed(2)}</span>
              </li>
            );
          })}
          {pricedLines.length === 0 && <li className="text-neutral-500">Empty</li>}
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

        {allowWallet && (
          <div className="mt-4 flex flex-col gap-2 border-t border-neutral-100 pt-3">
            <p className="text-xs font-semibold text-neutral-600">Or charge a student wallet</p>
            <Input
              placeholder="Search student name…"
              value={walletQuery}
              onChange={(e) => void handleWalletSearch(e.target.value)}
            />
            {walletMatches.length > 0 && !selectedWallet && (
              <ul className="flex flex-col gap-1">
                {walletMatches.map((w) => (
                  <li key={w.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedWallet(w)}
                      className="flex w-full items-center justify-between rounded-lg bg-neutral-50 p-2 text-left text-sm hover:bg-neutral-100"
                    >
                      <span>
                        <span className="font-semibold">{w.student_name}</span>{" "}
                        {(w.grade || w.teacher) && (
                          <span className="text-neutral-500">
                            ({[w.grade, w.teacher].filter(Boolean).join(", ")})
                          </span>
                        )}
                      </span>
                      <span>${w.balance.toFixed(2)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {walletSearched &&
              walletMatches.length === 0 &&
              !selectedWallet &&
              walletQuery.trim().length >= 2 && (
                <div className="rounded-lg bg-neutral-50 p-2 text-sm">
                  <p className="text-neutral-600">
                    No match for &quot;{walletQuery}&quot; — create a wallet for this student?
                  </p>
                  <div className="mt-2 flex gap-1">
                    <Input
                      placeholder="Grade (optional)"
                      value={newWalletGrade}
                      onChange={(e) => setNewWalletGrade(e.target.value)}
                      className="w-28"
                    />
                    <Input
                      placeholder="Teacher (optional)"
                      value={newWalletTeacher}
                      onChange={(e) => setNewWalletTeacher(e.target.value)}
                      className="flex-1"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    disabled={creatingWallet}
                    onClick={handleCreateWallet}
                  >
                    {creatingWallet ? "Creating…" : "Create & select"}
                  </Button>
                </div>
              )}
            {selectedWallet && (
              <div className="rounded-lg bg-accent-50 p-2 text-sm">
                <p>
                  <span className="font-semibold">{selectedWallet.student_name}</span> — balance:
                  ${selectedWallet.balance.toFixed(2)}
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-2"
                  disabled={charging || total <= 0}
                  onClick={chargeSelectedWallet}
                >
                  {charging ? "Charging…" : `Charge $${total.toFixed(2)} to wallet`}
                </Button>
                {total > selectedWallet.balance && (
                  <p className="mt-1 text-xs text-amber-700">
                    Cart total exceeds this wallet&apos;s balance — will try to cover the
                    difference from the assistance pool if this student qualifies.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {allowCash && (
          <div className="mt-4 flex flex-col gap-2 border-t border-neutral-100 pt-3">
            <p className="text-xs font-semibold text-neutral-600">Or take cash</p>
            <Button
              type="button"
              variant="outline"
              disabled={charging || total <= 0}
              onClick={chargeCashTender}
            >
              {charging ? "Recording…" : `Charge $${total.toFixed(2)} in cash`}
            </Button>
          </div>
        )}

        {message && <p className="mt-3 text-sm text-neutral-700">{message}</p>}
      </Card>
    </div>
  );
}
