import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Standard @supabase/ssr middleware pattern: refreshes the session cookie on
// every request so Server Components always see a valid (or correctly
// expired) session, and gates /admin and /org behind having one at all.
// Which specific role each area requires (platform admin vs. org member)
// is checked per-page via requireAdmin()/requireOrgStaff() (lib/auth.ts) —
// RLS is still the real enforcement boundary, this is just so
// unauthenticated users land on /login instead of a page that renders
// empty because every query is filtered to nothing.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const needsAuth =
    request.nextUrl.pathname.startsWith("/admin") || request.nextUrl.pathname.startsWith("/org");

  if (!user && needsAuth) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/org/:path*"],
};
