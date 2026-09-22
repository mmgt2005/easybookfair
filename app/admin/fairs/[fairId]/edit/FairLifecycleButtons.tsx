"use client";

import { useState, useTransition } from "react";
import {
  moveFairToReturnWindow,
  closeFair,
  sendSettlementPayout,
  createSettlementPaymentLink,
} from "../../actions";
import { Button } from "@/components/ui";

// Next.js redacts the message of any error *thrown* from a Server Action
// in production builds, replacing it with a generic "Server Components
// render" message + digest — even when the caller wraps the call in its
// own try/catch. The four actions these buttons call return { error }
// instead of throwing specifically so a real, useful message reaches the
// UI here; every handler below checks result.error, not a caught
// exception.

// window.confirm needs client-side JS, same reasoning as
// app/admin/demo/DemoToggleButton.tsx — a plain <form action={...}>
// can't intercept the click first.
export function MoveToReturnWindowButton({ fairId }: { fairId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    if (
      !window.confirm(
        "Move this fair into its return window? Buyers can still see past orders, but this is normally done once the fair itself is over and you're starting to collect unsold inventory back.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await moveFairToReturnWindow(fairId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleClick}>
        {isPending ? "Updating…" : "Move to return window"}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function CloseFairButton({ fairId }: { fairId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    if (
      !window.confirm(
        "Close this fair? This computes and locks the final settlement (payout or amount owed) from every sale, return, and the equipment rental fee. It cannot be undone.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await closeFair(fairId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleClick}>
        {isPending ? "Closing…" : "Close this fair"}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function SendPayoutButton({
  fairId,
  amount,
  disabled,
}: {
  fairId: string;
  amount: number;
  disabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await sendSettlementPayout(fairId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" size="sm" disabled={disabled || isPending} onClick={handleClick}>
        {isPending ? "Sending…" : `Send $${amount.toFixed(2)} payout via Stripe`}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function CreatePaymentLinkButton({ fairId, amount }: { fairId: string; amount: number }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await createSettlementPaymentLink(fairId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={handleClick}>
        {isPending ? "Creating…" : `Create $${amount.toFixed(2)} payment link`}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
