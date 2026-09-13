import { submitOrgSignup } from "./actions";
import { Button, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { success, error: errorMessage } = await searchParams;

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-12">
      <PageHeader
        title="Bring EasyBookFair to your school or organization 🏫"
        description="Tell us a bit about your organization and a platform admin will follow up to get you set up — no account needed to submit this."
      />

      {success && (
        <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700">
          Thanks! We&apos;ll review your submission and follow up by email once it&apos;s
          approved, with a link to set up your account and request your first fair.
        </p>
      )}
      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}

      <Card>
        <form action={submitOrgSignup} className="flex flex-col gap-3">
          <Field label="Organization name">
            <Input name="org_name" required placeholder="e.g. Lincoln Elementary PTA" />
          </Field>
          <Field label="Your name">
            <Input name="contact_name" required />
          </Field>
          <Field label="Your email">
            <Input name="contact_email" type="email" required />
          </Field>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" name="is_school" />
            We&apos;re a school (unlocks student wallets for your fairs)
          </label>
          <Field label="Anything else? (optional)">
            <Textarea
              name="message"
              rows={3}
              placeholder="Rough dates you're thinking of, size of your community, questions, etc."
            />
          </Field>

          <Button type="submit">Submit</Button>
        </form>
      </Card>
    </main>
  );
}
