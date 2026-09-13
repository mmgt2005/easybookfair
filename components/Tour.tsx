"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";

export type TourStep = { title: string; description: string };

function tourEventName(storageKey: string) {
  return `easybookfair:tour:${storageKey}`;
}

// Auto-shows once per browser (localStorage, not tied to any of the three
// intended triggers from the spec — approval, being added as staff, first
// login — all of which really just mean "the first time this person lands
// on their dashboard/admin area," so a first-visit flag covers all three
// without needing to track those events separately). Dismissing it never
// removes the trigger for good, though: TourLauncherButton below fires the
// same open event regardless of the stored flag, so the tour stays
// reachable from the nav afterward, not just on that first visit.
export function Tour({ storageKey, steps }: { storageKey: string; steps: TourStep[] }) {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(storageKey) === "1";
    } catch {
      // Private browsing / blocked storage — just skip auto-show; the nav
      // button still opens it on request either way.
    }
    if (!seen) {
      setOpen(true);
    }

    function handleOpenRequest() {
      setStepIndex(0);
      setOpen(true);
    }

    const eventName = tourEventName(storageKey);
    window.addEventListener(eventName, handleOpenRequest);
    return () => window.removeEventListener(eventName, handleOpenRequest);
  }, [storageKey]);

  function dismiss() {
    setOpen(false);
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // Ignore — worst case the tour auto-shows again next visit.
    }
  }

  if (!open || steps.length === 0) return null;

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:justify-end">
      <Card className="w-full max-w-sm shadow-lg">
        <p className="mb-1 text-xs font-semibold text-neutral-400">
          Step {stepIndex + 1} of {steps.length}
        </p>
        <h3 className="font-heading font-bold text-neutral-900">{step.title}</h3>
        <p className="mt-1 text-sm text-neutral-600">{step.description}</p>
        <div className="mt-3 flex items-center justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={dismiss}>
            Skip
          </Button>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStepIndex((i) => i - 1)}
              >
                Back
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => (isLast ? dismiss() : setStepIndex((i) => i + 1))}
            >
              {isLast ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// Always visible in the nav (see the module comment above) — clicking it
// re-opens the tour from step one, whether or not it's been seen before.
export function TourLauncherButton({ storageKey }: { storageKey: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(tourEventName(storageKey)))}
      className="font-semibold text-neutral-600 hover:text-accent-600"
    >
      🎓 Take the tour
    </button>
  );
}
