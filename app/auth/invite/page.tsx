"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui";

// Admin-generated links (inviteUserByEmail, used for every invite flow in
// this app — authors, author-submission approval, org-signup approval,
// platform-admin invites, org-staff invites) always deliver the session as
// a URL fragment (#access_token=...&refresh_token=...), never as a ?code=
// query param — confirmed directly from Supabase's own Auth Logs
// (login_method: "implicit" for these, vs. "pkce" for /login's own
// self-service magic link). A fragment is never sent to the server, so
// app/auth/callback/route.ts's server-side exchangeCodeForSession() can
// never see it — that route only ever works for /login's PKCE flow. This
// page instead runs client-side, reads the fragment directly out of
// window.location.hash, and hands it to the browser Supabase client's
// setSession(), which (via @supabase/ssr) syncs it into cookies so the
// server can see it on the next request — then redirects onward.
function InviteCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");

      if (!access_token || !refresh_token) {
        setError("This invite link is missing its sign-in info, or has already been used.");
        return;
      }

      const supabase = createClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

      if (sessionError) {
        setError(sessionError.message);
        return;
      }

      const next = searchParams.get("next") ?? "/admin";
      router.replace(next);
    }
    run();
  }, [router, searchParams]);

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
        <Card>
          <p className="text-sm text-red-600">{error}</p>
          <p className="mt-2 text-sm text-neutral-600">
            Ask whoever invited you to send a fresh invite, or try{" "}
            <a href="/login" className="text-accent-600 hover:underline">
              signing in
            </a>{" "}
            if you already have an account.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center px-6">
      <p className="text-neutral-600">Signing you in…</p>
    </main>
  );
}

export default function InvitePage() {
  return (
    <Suspense>
      <InviteCallback />
    </Suspense>
  );
}
