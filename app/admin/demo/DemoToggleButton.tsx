"use client";

import { useState, useTransition } from "react";
import { setDemoEnabled } from "./actions";
import { Button } from "@/components/ui";

// window.confirm needs client-side JS, so the enable/disable toggle can't
// stay a plain <form action={...}> like resetDemoFair — it has to intercept
// the click, show the Stripe-mode warning, and only then call the action.
export function DemoToggleButton({
  enabled,
  stripeMode,
}: {
  enabled: boolean;
  stripeMode: "test" | "live" | "unconfigured";
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    const modeWarning =
      stripeMode === "live"
        ? "Stripe is currently in LIVE mode — any payment made against the demo fair while it's enabled will charge a real card."
        : stripeMode === "test"
          ? "Stripe is currently in TEST mode — payments against the demo fair use sample cards only, no real money moves."
          : "Stripe isn't configured yet — payments against the demo fair will fail.";

    const action = enabled ? "disable" : "enable";
    if (!window.confirm(`${modeWarning}\n\nAre you sure you want to ${action} the demo fair?`)) {
      return;
    }

    startTransition(async () => {
      try {
        await setDemoEnabled(!enabled);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update demo fair");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleClick}>
        {isPending ? "Updating…" : enabled ? "Disable demo fair" : "Enable demo fair"}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
