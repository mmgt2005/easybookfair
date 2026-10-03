"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";

export function RespondToRequestButtons({
  acceptAction,
  declineAction,
}: {
  acceptAction: (formData: FormData) => void;
  declineAction: (formData: FormData) => void;
}) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="mt-3 flex flex-col gap-2">
      <form action={acceptAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="flex flex-1 items-center gap-2 text-xs text-neutral-600">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="h-4 w-4"
          />
          I have read and agree to these terms
        </label>
        <input type="hidden" name="terms_acknowledged" value={agreed ? "true" : "false"} />
        <Button type="submit" size="sm" disabled={!agreed}>
          Accept
        </Button>
      </form>
      <form action={declineAction} className="flex gap-2">
        <Input name="author_note" placeholder="Note (optional)" className="flex-1" />
        <Button type="submit" size="sm" variant="outline">
          Decline
        </Button>
      </form>
    </div>
  );
}
