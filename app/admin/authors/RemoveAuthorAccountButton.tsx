"use client";

import { useState, useTransition } from "react";
import { removeAuthorAccount } from "./actions";

// window.confirm needs client-side JS, so this can't stay a plain
// <form action={...}> like "Edit"/"Requests" — same reasoning as
// DemoToggleButton.tsx.
export function RemoveAuthorAccountButton({
  authorUserId,
  authorName,
}: {
  authorUserId: string;
  authorName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    if (
      !window.confirm(
        `Remove ${authorName}'s account? They'll lose access to the author portal until re-invited, and reappear under "From catalog items — no account yet" if a catalog item still lists them. Their actual login isn't deleted — re-inviting them later reuses the same account.`,
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        await removeAuthorAccount(authorUserId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove account");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        className="font-semibold text-red-600 hover:underline disabled:opacity-50"
      >
        {isPending ? "Removing…" : "Remove account"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
