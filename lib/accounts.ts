import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAccountSignInEmail, sendInviteEmail, type InviteContext } from "./email";

// Shared by every "invite a real account for this email" flow in the app
// (author-submission approval, the catalog-only-author "create account &
// view as" action, org-signup approval, and the admin/org-staff invite
// actions). Supabase errors on inviting an email that's already
// registered, so fall back to finding their existing user id via
// listUsers() (supabase-js has no getUserByEmail) rather than failing
// the caller outright.
//
// Uses generateLink() (Admin API), not inviteUserByEmail(), for the happy
// path too — generateLink never sends email itself (the caller delivers
// the link), which is exactly what's wanted here: it lets us send a real,
// role-specific, branded email via Resend (sendInviteEmail, lib/email.ts)
// instead of Supabase's own generic built-in "Invite user" template, and
// it sidesteps Supabase's own restrictive email-sending rate limit
// entirely, since Supabase never sends anything in this path at all.
// `context` carries whichever of the five invite flows is calling, so the
// email can say something specific rather than one generic line for all
// of them.
//
// The already-registered fallback (e.g. an author whose account was
// re-created after "Remove account" — that only unlinks the authors row,
// never the underlying login, so the address is still taken) used to
// leave the person with no email at all, since the invite call failed
// before sending anything. Now generates a fresh magic-link via the same
// Admin API (works for an existing account regardless of whether it was
// ever confirmed) and delivers it ourselves — best-effort, same "never
// block the caller on a failed send" posture as every other email in this
// app.
export async function inviteOrFindAccount(
  service: SupabaseClient,
  email: string,
  redirectTo: string,
  context: InviteContext,
): Promise<string> {
  const invite = await service.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  });
  if (!invite.error) {
    try {
      await sendInviteEmail({ to: email, actionLink: invite.data.properties.action_link, context });
    } catch (err) {
      console.error(`Failed to send invite email to ${email}`, err);
    }
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
