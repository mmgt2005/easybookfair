import type { SupabaseClient } from "@supabase/supabase-js";

// Shared by every "invite a real account for this email" flow in the app
// (author-submission approval, the catalog-only-author "create account &
// view as" action, org-signup approval, and the admin/org-staff invite
// actions). Supabase errors on inviting an email that's already
// registered, so fall back to finding their existing user id via
// listUsers() (supabase-js has no getUserByEmail) rather than failing
// the caller outright.
export async function inviteOrFindAccount(
  service: SupabaseClient,
  email: string,
  redirectTo: string,
): Promise<string> {
  const invite = await service.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (!invite.error) {
    return invite.data.user.id;
  }

  const { data: existing, error: listError } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const match = existing?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (listError || !match) {
    throw new Error(`Could not create or find an account for ${email}: ${invite.error.message}`);
  }
  return match.id;
}
