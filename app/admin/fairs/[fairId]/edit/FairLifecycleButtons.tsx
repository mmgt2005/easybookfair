"use client";

import { useState, useTransition } from "react";
import { moveFairToReturnWindow, closeFair } from "../../actions";
import { Button } from "@/components/ui";

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
      try {
        await moveFairToReturnWindow(fairId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update fair");
      }
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
      try {
        await closeFair(fairId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to close fair");
      }
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
