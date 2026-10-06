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
        // Without this, signInWithOtp happily creates a brand-new account
        // for any email typed here, even one nobody invited — that account
        // then has no row in platform_admins/org_members/authors, so the
        // person gets a confusing "not authorized" page *after* already
        // receiving and clicking a sign-in email. Setting this to false
        // surfaces that as a clear error right here instead. Every real
        // account in this app is created by an admin invite (or an
        // approved /author/submit submission) before anyone ever reaches
        // this page, so there's no legitimate first-time-signup case this
        // would block.
        shouldCreateUser: false,
      },
    });
    if (error) {
      setErrorMessage(
        /signup/i.test(error.message)
          ? "No account found for that email yet. Ask an admin to invite you first, then try again."
          : error.message,
      );
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
