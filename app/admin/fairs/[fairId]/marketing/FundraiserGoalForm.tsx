"use client";

import { useState, useTransition } from "react";
import { updateFundraiserGoal } from "../../actions";
import { Button, Field, Input, Textarea } from "@/components/ui";

// Next.js redacts a thrown Server Action error's message in production —
// updateFundraiserGoal returns { error } as ordinary data instead (same
// pattern as ./edit/FairLifecycleButtons.tsx), so this needs
// useTransition + a plain function component rather than a bare
// <form action={...}>.
export function FundraiserGoalForm({
  fairId,
  goalAmount,
  description,
}: {
  fairId: string;
  goalAmount: number | null;
  description: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateFundraiserGoal(fairId, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <Field label="Fundraiser goal amount">
        <Input
          key={goalAmount ?? "none"}
          type="number"
          step="0.01"
          min="0.01"
          name="fundraiser_goal_amount"
          defaultValue={goalAmount ?? ""}
          placeholder="e.g. 500.00"
        />
      </Field>
      <Field
        label="Fundraiser description"
        hint="Shown on the public homepage once a goal is set, as long as wallet funding is turned on for this fair."
      >
        <Textarea
          key={description ?? "none"}
          name="fundraiser_description"
          rows={3}
          defaultValue={description ?? ""}
          placeholder="What is this fundraiser for? e.g. new library shelving, playground equipment..."
        />
      </Field>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Save fundraiser goal"}
        </Button>
        {saved && !error && <span className="text-xs text-green-700">Saved!</span>}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-xs text-neutral-500">
        Leave the amount blank and save to remove this fair from the homepage carousel.
      </p>
    </form>
  );
}
