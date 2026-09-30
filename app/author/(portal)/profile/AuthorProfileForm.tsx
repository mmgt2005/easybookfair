"use client";

import { useState, useTransition } from "react";
import { updateAuthorProfile } from "../../actions";
import { Button, Field, Input, Textarea } from "@/components/ui";

// Next.js redacts a thrown Server Action error's message in production —
// updateAuthorProfile returns { error } as ordinary data instead (same
// pattern as FundraiserGoalForm.tsx/FairSalesTaxForm.tsx), so this needs
// useTransition + a plain function component rather than a bare
// <form action={...}>.
export function AuthorProfileForm({
  initialBio,
  initialWebsite,
}: {
  initialBio: string | null;
  initialWebsite: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateAuthorProfile(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <Field label="About you" hint="Shown on your public author page.">
        <Textarea
          key={initialBio ?? "none"}
          name="bio"
          rows={4}
          defaultValue={initialBio ?? ""}
          placeholder="Tell readers a bit about yourself..."
        />
      </Field>
      <Field label="Website" hint="Optional — your own site, blog, or social profile.">
        <Input
          key={initialWebsite ?? "none"}
          name="website"
          type="text"
          defaultValue={initialWebsite ?? ""}
          placeholder="yourwebsite.com"
        />
      </Field>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Save profile"}
        </Button>
        {saved && !error && <span className="text-xs text-green-700">Saved!</span>}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
