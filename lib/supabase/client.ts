import { createBrowserClient } from "@supabase/ssr";

// Untyped until `lib/supabase/types.ts` has real generated types — see the
// note in that file for how to generate them once a project exists.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
