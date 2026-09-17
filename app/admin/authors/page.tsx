import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { startViewAsAuthor } from "../view-as/actions";
import { createAuthorAccountAndViewAs } from "./actions";
import { Card, PageHeader } from "@/components/ui";

export default async function AuthorsPage() {
  const supabase = await createClient();

  const [{ data: authors }, { data: catalogItems }] = await Promise.all([
    supabase.from("authors").select("user_id, name, email, phone, created_at").order("name"),
    supabase
      .from("catalog_items")
      .select("author_name, author_email, author_phone")
      .not("author_email", "is", null),
  ]);

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

      <Card className="overflow-x-auto p-0">
        <table className="w-full max-w-2xl text-sm">
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
            {(authors ?? []).map((author) => (
              <tr key={author.user_id} className="border-b border-neutral-50 last:border-0">
                <td className="py-2 pl-4 pr-4 font-semibold text-neutral-800">{author.name}</td>
                <td className="py-2 pr-4 text-neutral-600">{author.email}</td>
                <td className="py-2 pr-4 text-neutral-600">{author.phone ?? "—"}</td>
                <td className="py-2 pr-4 text-neutral-600">
                  {new Date(author.created_at).toLocaleDateString()}
                </td>
                <td className="py-2 pr-4">
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
            ))}
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
