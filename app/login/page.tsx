"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Input } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setErrorMessage(error.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="font-heading text-2xl font-bold text-primary-600">Sign in 👋</h1>
      <Card>
        {status === "sent" ? (
          <p className="text-neutral-600">Check {email} for a sign-in link.</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" disabled={status === "sending"}>
              {status === "sending" ? "Sending…" : "Send sign-in link"}
            </Button>
            {status === "error" && <p className="text-sm text-red-600">{errorMessage}</p>}
          </form>
        )}
      </Card>
    </main>
  );
}
