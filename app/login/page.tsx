"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Input } from "@/components/ui";

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const supabase = createClient();
    // Forwards `next` (set by middleware.ts when it redirects an
    // unauthenticated /admin or /org visit here) through to the callback
    // route, so e.g. an org-staff member bounced from /org actually lands
    // back on /org after signing in instead of app/auth/callback/route.ts's
    // own role-lookup fallback (which still works fine, just does an extra
    // round trip it didn't need to).
    const next = searchParams.get("next");
    const redirectTo = next
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
      : `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
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

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
