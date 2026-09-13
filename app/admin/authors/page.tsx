import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { startViewAsAuthor } from "../view-as/actions";
import { Card, PageHeader } from "@/components/ui";

export default async function AuthorsPage() {
  const supabase = await createClient();

  const { data: authors } = await supabase
    .from("authors")
    .select("user_id, name, email, created_at")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Authors 🖋️"
        description="Accounts created automatically when a submission is approved (/admin/author-submissions) — no manual invite step."
      />

      <Card className="overflow-x-auto p-0">
        <table className="w-full max-w-2xl text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
              <th className="py-2 pl-4 pr-4">Name</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Since</th>
              <th className="py-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {(authors ?? []).map((author) => (
              <tr key={author.user_id} className="border-b border-neutral-50 last:border-0">
                <td className="py-2 pl-4 pr-4 font-semibold text-neutral-800">{author.name}</td>
                <td className="py-2 pr-4 text-neutral-600">{author.email}</td>
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
                <td colSpan={4} className="py-4 pl-4 text-neutral-500">
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
    </div>
  );
}
