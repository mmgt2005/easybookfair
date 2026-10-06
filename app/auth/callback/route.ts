import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Magic-link landing point: exchanges the one-time code Supabase put in the
// email link for a real session, then sends the user on to wherever they
// were headed (middleware.ts sets `next` when it redirects an unauthenticated
// /admin or /org request here; app/login/page.tsx forwards the same param
// through when one was given).
//
// When there's no explicit `next` at all — a plain self-serve sign-in with
// no prior context, e.g. clicking "Sign in" on the public landing page, or
// an author returning days after their original invite — this used to
// default to /admin unconditionally. That sent any non-admin (an author, an
// org staff member) straight to /unauthorized right after a fully valid
// sign-in, since they're not a platform admin. Now looks up which of the
// three areas this account actually belongs to instead of guessing.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const destination = next || (await resolveHomeArea(supabase));
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}

async function resolveHomeArea(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/login";

  const [{ data: admin }, { data: orgMember }, { data: author }] = await Promise.all([
    supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("org_members").select("user_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("authors").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);

  if (admin) return "/admin";
  if (orgMember) return "/org";
  if (author) return "/author";
  return "/unauthorized";
}
