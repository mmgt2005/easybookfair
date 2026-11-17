"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";
import { requestReceiptEmail } from "./actions";

// Triggers the browser's print dialog immediately on load — lets
// CheckoutClient.tsx's "Print receipt" button open this page with
// ?print=1 so staff doesn't have to find/click a second button here.
export function AutoPrint() {
  useEffect(() => {
    window.print();
  }, []);
  return null;
}

// Lets a parent standing nearby with a phone self-serve a copy of an
// in-person receipt after the fact, without staff needing to do anything
// at checkout — the online-only auto-email plus the optional buyerEmail
// field at checkout don't cover every case.
export function EmailReceiptForm({
  fairId,
  checkoutSessionId,
}: {
  fairId: string;
  checkoutSessionId: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      await requestReceiptEmail(fairId, checkoutSessionId, email);
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return <p className="mt-3 text-xs text-neutral-600 print:hidden">Sent — check your inbox.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2 print:hidden">
      <p className="text-xs font-semibold text-neutral-600">Email me this receipt</p>
      <div className="flex gap-2">
        <Input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" size="sm" variant="outline" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Send"}
        </Button>
      </div>
      {status === "error" && <p className="text-xs text-red-600">Couldn&apos;t send — try again.</p>}
    </form>
  );
}
