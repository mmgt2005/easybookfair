import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { startViewAsAuthor } from "../view-as/actions";
import { createAuthorAccountAndViewAs } from "./actions";
import { Badge, Button, Card, Field, Input, PageHeader } from "@/components/ui";

export default async function AuthorsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorMessage } = await searchParams;
  const supabase = await createClient();

  const [{ data: authors }, { data: catalogItems }, { data: unreadMessages }] = await Promise.all([
    supabase.from("authors").select("user_id, name, email, phone, created_at").order("name"),
    supabase
      .from("catalog_items")
      .select("author_name, author_email, author_phone")
      .not("author_email", "is", null),
    // Unread-count signal per author (author-sent, not yet seen by any
    // admin) — counted client-side from the raw rows rather than a
    // GROUP BY RPC, same "aggregate in JS" idiom used throughout this app
    // (e.g. salesByItem in the author dashboard).
    supabase
      .from("author_messages")
      .select("author_user_id")
      .eq("sender_role", "author")
      .is("read_at", null),
  ]);

  const unreadCountByAuthor = new Map<string, number>();
  for (const row of unreadMessages ?? []) {
    unreadCountByAuthor.set(row.author_user_id, (unreadCountByAuthor.get(row.author_user_id) ?? 0) + 1);
  }

  const knownEmails = new Set((authors ?? []).map((a) => a.email.toLowerCase()));
  const catalogOnlyByEmail = new Map<
    string,
    { name: string; email: string; phone: string | null }
  >();
  for (const item of catalogItems ?? []) {
    const email = item.author_email!.toLowerCase();
    if (knownEmails.has(email) || catalogOnlyByEmail.has(email)) continue;
    catalogOnlyByEmail.set(email, {
      name: item.author_name ?? item.author_email!,
      email: item.author_email!,
      phone: item.author_phone,
    });
  }
  const catalogOnlyAuthors = Array.from(catalogOnlyByEmail.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Authors 🖋️"
        description="Accounts created automatically when a submission is approved (/admin/author-submissions), or on demand below for an author only linked through a catalog item's contact info."
      />

      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}

      <Card className="max-w-lg">
        <h2 className="font-heading font-bold text-neutral-900">Invite a new author</h2>
        <p className="mb-2 text-xs text-neutral-500">
          Creates a real account and switches you into &quot;viewing as&quot; them so you can
          confirm their dashboard looks right — no catalog item or submission needed first.
        </p>
        <form action={createAuthorAccountAndViewAs} className="flex flex-col gap-3">
          <Field label="Name">
            <Input name="name" required />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" required />
          </Field>
          <Field label="Phone (optional)">
            <Input name="phone" type="tel" />
          </Field>
          <Button type="submit" size="sm">
            Invite &amp; view as
          </Button>
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full max-w-3xl text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
              <th className="py-2 pl-4 pr-4">Name</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Phone</th>
              <th className="py-2 pr-4">Since</th>
              <th className="py-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {(authors ?? []).map((author) => {
              const unread = unreadCountByAuthor.get(author.user_id) ?? 0;
              return (
                <tr key={author.user_id} className="border-b border-neutral-50 last:border-0">
                  <td className="py-2 pl-4 pr-4 font-semibold text-neutral-800">{author.name}</td>
                  <td className="py-2 pr-4 text-neutral-600">{author.email}</td>
                  <td className="py-2 pr-4 text-neutral-600">{author.phone ?? "—"}</td>
                  <td className="py-2 pr-4 text-neutral-600">
                    {new Date(author.created_at).toLocaleDateString()}
                  </td>
                  <td className="flex flex-wrap gap-3 py-2 pr-4">
                    <Link
                      href={`/admin/authors/${author.user_id}/edit`}
                      className="font-semibold text-accent-600 hover:underline"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/admin/authors/${author.user_id}/inventory`}
                      className="font-semibold text-accent-600 hover:underline"
                    >
                      Requests
                    </Link>
                    <Link
                      href={`/admin/authors/${author.user_id}/messages`}
                      className="font-semibold text-accent-600 hover:underline"
                    >
                      Messages {unread > 0 && <Badge tone="warning">{unread}</Badge>}
                    </Link>
                    <form action={startViewAsAuthor.bind(null, author.user_id)}>
                      <button
                        type="submit"
                        className="font-semibold text-accent-600 hover:underline"
                      >
                        View as
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {(authors ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 pl-4 text-neutral-500">
                  No authors yet — approve a submission at{" "}
                  <Link href="/admin/author-submissions" className="text-accent-600 hover:underline">
                    /admin/author-submissions
                  </Link>{" "}
                  to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-x-auto p-0">
        <h2 className="px-4 pt-4 font-heading font-bold text-neutral-900">
          From catalog items — no account yet
        </h2>
        <p className="px-4 pb-2 text-xs text-neutral-500">
          Contact info attached directly to a catalog item (
          <Link href="/admin/catalog" className="text-accent-600 hover:underline">
            /admin/catalog
          </Link>
          ), not a real submission — no account exists until you create one.
        </p>
        {catalogOnlyAuthors.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-neutral-500">None right now.</p>
        ) : (
          <table className="w-full max-w-2xl text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
                <th className="py-2 pl-4 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Phone</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {catalogOnlyAuthors.map((author) => (
                <tr key={author.email} className="border-b border-neutral-50 last:border-0">
                  <td className="py-2 pl-4 pr-4 font-semibold text-neutral-800">{author.name}</td>
                  <td className="py-2 pr-4 text-neutral-600">{author.email}</td>
                  <td className="py-2 pr-4 text-neutral-600">{author.phone ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <form action={createAuthorAccountAndViewAs}>
                      <input type="hidden" name="name" value={author.name} />
                      <input type="hidden" name="email" value={author.email} />
                      <input type="hidden" name="phone" value={author.phone ?? ""} />
                      <button
                        type="submit"
                        className="font-semibold text-accent-600 hover:underline"
                      >
                        Create account &amp; view as
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
