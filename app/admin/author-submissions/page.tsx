import { createClient } from "@/lib/supabase/server";
import { approveAuthorSubmission, declineAuthorSubmission } from "./actions";
import { Badge, Button, Card, Input, PageHeader, statusTone } from "@/components/ui";

export default async function AuthorSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorMessage } = await searchParams;
  const supabase = await createClient();

  const { data: submissions } = await supabase
    .from("author_submissions")
    .select(
      "id, author_name, author_email, title, item_type, category, image_url, suggested_retail_price, wholesale_price, status, admin_note, submitted_by_admin_id, created_at",
    )
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Author submissions 📖"
        description="Books/merchandise submitted from the public form (/author/submit). Approving invites the author to a real account and adds the item to the catalog at its computed wholesale cost."
      />

      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}

      <div className="flex flex-col gap-4">
        {(submissions ?? []).map((s) => {
          const approveForSubmission = approveAuthorSubmission.bind(null, s.id);
          const declineForSubmission = declineAuthorSubmission.bind(null, s.id);
          return (
            <Card key={s.id} className="max-w-2xl">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  {s.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.image_url}
                      alt=""
                      className="h-16 w-12 rounded object-cover"
                    />
                  )}
                  <div>
                    <h2 className="font-heading font-bold text-neutral-900">{s.title}</h2>
                    <p className="text-sm text-neutral-600">
                      {s.author_name} — {s.author_email}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {s.item_type} {s.category ? `· ${s.category}` : ""} — retail $
                      {s.suggested_retail_price.toFixed(2)}, wholesale $
                      {s.wholesale_price.toFixed(2)}
                    </p>
                    {s.submitted_by_admin_id && (
                      <p className="mt-1 text-xs text-amber-700">
                        👁️ Submitted by an admin viewing as this author.
                      </p>
                    )}
                  </div>
                </div>
                <Badge tone={statusTone(s.status)}>{s.status}</Badge>
              </div>

              {s.status === "pending" && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <form action={approveForSubmission}>
                    <Button type="submit" size="sm">
                      Approve
                    </Button>
                  </form>
                  <form action={declineForSubmission} className="flex flex-1 gap-2">
                    <Input name="admin_note" placeholder="Reason (optional)" className="flex-1" />
                    <Button type="submit" size="sm" variant="outline">
                      Decline
                    </Button>
                  </form>
                </div>
              )}

              {s.status === "declined" && s.admin_note && (
                <p className="mt-2 text-sm text-neutral-600">Reason: {s.admin_note}</p>
              )}
            </Card>
          );
        })}
        {(submissions ?? []).length === 0 && (
          <p className="text-sm text-neutral-500">No author submissions yet.</p>
        )}
      </div>
    </div>
  );
}
