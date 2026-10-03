"use client";

import { useState, useTransition } from "react";
import { submitBookReview } from "@/app/authors/[authorId]/actions";
import { Button, Honeypot, TurnstileWidget } from "@/components/ui";

// Anyone can submit (no purchase verification — product owner's
// decision, since a strict check would have silently excluded every
// in-person buyer); admin approval before it's ever publicly visible is
// the sole gate, with Turnstile + honeypot carrying the anti-abuse weight
// that verification would otherwise have. Calls the Server Action
// directly as a function (not a <form action>) so the result can be
// shown inline without a page navigation, since this form is nested
// per-book inside a loop.
export function BookReviewForm({ catalogItemId }: { catalogItemId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [result, setResult] = useState<{ error?: string; success?: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left text-sm font-semibold text-accent-600 hover:underline"
      >
        Write a review
      </button>
    );
  }

  if (result?.success) {
    return (
      <p className="text-sm text-green-700">
        Thanks — your review is pending admin approval.
      </p>
    );
  }

  function handleSubmit() {
    const formData = new FormData();
    formData.set("reviewer_name", name);
    formData.set("reviewer_email", email);
    formData.set("rating", String(rating));
    formData.set("review_text", reviewText);
    if (turnstileToken) formData.set("cf-turnstile-response", turnstileToken);

    startTransition(async () => {
      const res = await submitBookReview(catalogItemId, formData);
      setResult(res);
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border-2 border-neutral-100 p-2 text-sm">
      {result?.error && <p className="text-red-600">{result.error}</p>}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className="rounded-lg border border-neutral-200 px-2 py-1"
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        placeholder="Your email"
        className="rounded-lg border border-neutral-200 px-2 py-1"
      />
      <select
        value={rating}
        onChange={(e) => setRating(Number(e.target.value))}
        className="rounded-lg border border-neutral-200 px-2 py-1"
      >
        {[5, 4, 3, 2, 1].map((n) => (
          <option key={n} value={n}>
            {"★".repeat(n)}
            {"☆".repeat(5 - n)}
          </option>
        ))}
      </select>
      <textarea
        value={reviewText}
        onChange={(e) => setReviewText(e.target.value)}
        placeholder="What did you think? (optional)"
        rows={3}
        className="rounded-lg border border-neutral-200 px-2 py-1"
      />
      <Honeypot />
      <TurnstileWidget onVerify={setTurnstileToken} />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={isPending} onClick={handleSubmit}>
          Submit review
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
