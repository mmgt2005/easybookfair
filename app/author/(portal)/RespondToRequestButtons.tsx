"use client";

import { Button, Input } from "@/components/ui";

export function RespondToRequestButtons({
  acceptAction,
  declineAction,
}: {
  acceptAction: (formData: FormData) => void;
  declineAction: (formData: FormData) => void;
}) {
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
      <form action={acceptAction}>
        <Button type="submit" size="sm">
          Accept
        </Button>
      </form>
      <form action={declineAction} className="flex flex-1 gap-2">
        <Input name="author_note" placeholder="Note (optional)" className="flex-1" />
        <Button type="submit" size="sm" variant="outline">
          Decline
        </Button>
      </form>
    </div>
  );
}
