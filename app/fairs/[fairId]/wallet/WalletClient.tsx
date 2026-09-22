"use client";

import { useState, type FormEvent } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { getStripeClient } from "@/lib/stripeClient";
import { createWalletFunding, createPoolFunding } from "./actions";
import { Button, Field, Input } from "@/components/ui";

export function WalletClient({ fairId }: { fairId: string }) {
  const [mode, setMode] = useState<"student" | "pool">("student");
  const [studentName, setStudentName] = useState("");
  const [grade, setGrade] = useState("");
  const [teacher, setTeacher] = useState("");
  const [amount, setAmount] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result =
        mode === "student"
          ? await createWalletFunding(fairId, studentName, grade, teacher, Number(amount), parentEmail)
          : await createPoolFunding(fairId, Number(amount), parentEmail);
      setClientSecret(result.clientSecret);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (clientSecret) {
    return (
      <Elements stripe={getStripeClient()} options={{ clientSecret }}>
        <PaymentForm fairId={fairId} />
      </Elements>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "student" ? "secondary" : "outline"}
          onClick={() => setMode("student")}
        >
          Fund a specific student
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "pool" ? "secondary" : "outline"}
          onClick={() => setMode("pool")}
        >
          Donate to the assistance pool
        </Button>
      </div>

      {mode === "student" ? (
        <>
          <Field label="Student's name">
            <Input value={studentName} onChange={(e) => setStudentName(e.target.value)} required />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Grade (optional)">
              <Input value={grade} onChange={(e) => setGrade(e.target.value)} />
            </Field>
            <Field label="Teacher (optional)">
              <Input value={teacher} onChange={(e) => setTeacher(e.target.value)} />
            </Field>
          </div>
          <p className="text-xs text-neutral-500">
            Grade/teacher help tell apart students with the same name at checkout — not required,
            but recommended.
          </p>
        </>
      ) : (
        <p className="text-xs text-neutral-500">
          Your donation goes into a shared pool that automatically covers part of a purchase for
          any student who doesn&apos;t have enough of their own wallet balance — not tied to one
          named student.
        </p>
      )}

      <Field label="Your email">
        <Input
          type="email"
          value={parentEmail}
          onChange={(e) => setParentEmail(e.target.value)}
          required
        />
      </Field>
      <Field label="Amount to add">
        <Input
          type="number"
          step="0.01"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </Field>
      <div className="flex gap-2">
        {[10, 20, 50].map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant={amount === String(preset) ? "secondary" : "outline"}
            onClick={() => setAmount(String(preset))}
          >
            ${preset}
          </Button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Preparing…" : "Continue to payment"}
      </Button>
    </form>
  );
}

function PaymentForm({ fairId }: { fairId: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/fairs/${fairId}/wallet?funded=1`,
      },
    });

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <PaymentElement />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={!stripe || submitting}>
        {submitting ? "Processing…" : "Fund wallet"}
      </Button>
    </form>
  );
}
