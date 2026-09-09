import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Magic-link landing point: exchanges the one-time code Supabase put in the
// email link for a real session, then sends the user on to wherever they
// were headed (middleware.ts sets `next` when it redirects an unauthenticated
// /admin request here).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/admin";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
