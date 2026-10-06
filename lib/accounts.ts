import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAccountSignInEmail } from "./email";

// Shared by every "invite a real account for this email" flow in the app
// (author-submission approval, the catalog-only-author "create account &
// view as" action, org-signup approval, and the admin/org-staff invite
// actions). Supabase errors on inviting an email that's already
// registered, so fall back to finding their existing user id via
// listUsers() (supabase-js has no getUserByEmail) rather than failing
// the caller outright.
//
// That fallback used to leave the person with no email at all: inviteUserByEmail()
// fails before sending anything once the address is already registered (e.g. an
// author whose account was re-created after "Remove account" — that only unlinks
// the authors row, never the underlying login, so the address is still taken),
// so reusing the existing id silently meant nobody ever got a link to sign in
// with. Now generates a fresh magic-link via the Admin API (works for an
// existing account regardless of whether it was ever confirmed) and delivers it
// ourselves — best-effort, same "never block the caller on a failed send"
// posture as every other email in this app.
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

  try {
    const { data: link, error: linkError } = await service.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    if (linkError) throw linkError;
    await sendAccountSignInEmail({ to: email, actionLink: link.properties.action_link });
  } catch (err) {
    console.error(`Failed to send a sign-in link to ${email} (account already existed)`, err);
  }

  return match.id;
}
