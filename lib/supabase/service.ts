import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS. Server-only: never import this from
 * client components, and never expose SUPABASE_SERVICE_ROLE_KEY to the
 * browser. Reserved for webhook handlers and trusted server-side jobs
 * (e.g. the Stripe payment webhook, settlement close-out).
 *
 * Untyped until `lib/supabase/types.ts` has real generated types.
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        // Without this, inviteUserByEmail()/admin-generated links deliver
        // the session via a URL fragment (#access_token=...) once clicked
        // — invisible to a server Route Handler, since fragments are never
        // sent to the server at all. PKCE instead appends a ?code=... query
        // param that app/auth/callback/route.ts's exchangeCodeForSession()
        // can actually see, matching how /login's own magic-link flow
        // (via the @supabase/ssr browser client, PKCE by default) already
        // works. Confirmed via Supabase's own auth logs: an invite link
        // was logging in with login_method "implicit" while /login's
        // magic link logged in with "pkce" — this makes both consistent.
        flowType: "pkce",
      },
    },
  );
}
