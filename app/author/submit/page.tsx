import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getViewAsAuthorId } from "@/lib/viewAs";
import { submitAuthorSubmission } from "./actions";
import { PriceInput } from "./PriceInput";
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";

export default async function AuthorSubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { success, error: errorMessage } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Prefill from either the signed-in author's own profile, or — if an
  // admin is currently "viewing as" an author (lib/viewAs.ts) — that
  // author's profile instead. Purely a display convenience: the action
  // (submitAuthorSubmission) re-derives the real author_user_id itself
  // server-side rather than trusting anything from this page.
  let authorProfile: { name: string; email: string } | null = null;
  let viewingAsAuthor = false;
  if (user) {
    const viewAsAuthorId = await getViewAsAuthorId();
    if (viewAsAuthorId) {
      const { data: adminRow } = await supabase
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (adminRow) {
        const { data } = await supabase
          .from("authors")
          .select("name, email")
          .eq("user_id", viewAsAuthorId)
          .maybeSingle();
        authorProfile = data;
        viewingAsAuthor = true;
      }
    }

    if (!authorProfile && !viewingAsAuthor) {
      const { data } = await supabase
        .from("authors")
        .select("name, email")
        .eq("user_id", user.id)
        .maybeSingle();
      authorProfile = data;
    }
  }

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-12">
      <PageHeader
        title="Submit a book or item 📖"
        description="Authors and vendors can submit books or merchandise for EasyBookFair to carry. A platform admin reviews every submission before it's added to the catalog."
      />

      {success && (
        <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700">
          Thanks! Your submission is in for review — if approved, you&apos;ll get an email to set
          up an account and see how it&apos;s selling.
        </p>
      )}
      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}
      {viewingAsAuthor && (
        <p className="rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900">
          👁️ Admin mode — this submission will be attributed to {authorProfile?.name}, not this
          admin account.
        </p>
      )}

      <Card>
        <form
          action={submitAuthorSubmission}
          encType="multipart/form-data"
          className="flex flex-col gap-3"
        >
          <Field label="Your name">
            <Input name="author_name" required defaultValue={authorProfile?.name ?? ""} />
          </Field>
          <Field label="Your email">
            <Input
              name="author_email"
              type="email"
              required
              defaultValue={authorProfile?.email ?? ""}
            />
          </Field>
          <Field label="Title">
            <Input name="title" required placeholder="Book or item title" />
          </Field>
          <Field label="Type">
            <Select name="item_type" defaultValue="book">
              <option value="book">Book</option>
              <option value="merchandise">Merchandise</option>
            </Select>
          </Field>
          <Field label="Category (optional)">
            <Input name="category" placeholder="e.g. Fiction, Picture Books" />
          </Field>
          <Field label="Description (optional)">
            <Textarea name="description" rows={3} />
          </Field>
          <Field label="Front cover image (optional)">
            <Input name="front_cover" type="file" accept="image/*" />
          </Field>
          <Field label="Back cover image (optional)">
            <Input name="back_cover" type="file" accept="image/*" />
          </Field>
          <Field label="Interior PDF, for review (optional)">
            <Input name="interior_pdf" type="file" accept="application/pdf" />
          </Field>

          <PriceInput />

          <Button type="submit">Submit for review</Button>
        </form>
      </Card>

      {authorProfile && (
        <p className="text-center text-sm text-neutral-500">
          <Link href="/author" className="font-semibold text-accent-600 hover:underline">
            ← Back to your dashboard
          </Link>
        </p>
      )}
    </main>
  );
}
