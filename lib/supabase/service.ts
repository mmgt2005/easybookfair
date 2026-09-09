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
    { auth: { persistSession: false } },
  );
}
