import { cookies } from "next/headers";

// "View as" lets an admin preview/act in the org or author portal as a
// specific org/author, without a real session swap (no impersonated
// user's token is ever issued to the admin) — these cookies are just a
// UI routing signal, not a credential. Every read of them MUST be
// re-verified against app.is_platform_admin() (via the caller's own real
// session) before being trusted; a cookie by itself grants nothing, since
// requests still run under the admin's own Supabase session/RLS.
const ORG_COOKIE = "ebf_view_as_org";
const AUTHOR_COOKIE = "ebf_view_as_author";

export async function getViewAsOrgId(): Promise<string | null> {
  const store = await cookies();
  return store.get(ORG_COOKIE)?.value ?? null;
}

export async function getViewAsAuthorId(): Promise<string | null> {
  const store = await cookies();
  return store.get(AUTHOR_COOKIE)?.value ?? null;
}

export async function setViewAsOrg(orgId: string) {
  const store = await cookies();
  store.set(ORG_COOKIE, orgId, { httpOnly: true, sameSite: "lax", path: "/" });
  store.delete(AUTHOR_COOKIE);
}

export async function setViewAsAuthor(authorUserId: string) {
  const store = await cookies();
  store.set(AUTHOR_COOKIE, authorUserId, { httpOnly: true, sameSite: "lax", path: "/" });
  store.delete(ORG_COOKIE);
}

export async function clearViewAs() {
  const store = await cookies();
  store.delete(ORG_COOKIE);
  store.delete(AUTHOR_COOKIE);
}
