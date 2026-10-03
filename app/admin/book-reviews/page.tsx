import { createClient } from "@/lib/supabase/server";
import { approveBookReview, declineBookReview } from "./actions";
import { Badge, Button, Card, Input, PageHeader, statusTone } from "@/components/ui";

export default async function BookReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorMessage } = await searchParams;
  const supabase = await createClient();

  const { data: reviews } = await supabase
    .from("book_reviews")
    .select(
      "id, reviewer_name, reviewer_email, rating, review_text, status, admin_note, created_at, catalog_items(title)",
    )
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Book reviews ⭐"
        description="Submitted from an author's public page — no purchase is verified, so every review needs admin approval before it's shown publicly."
      />

      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}

      <div className="flex flex-col gap-4">
        {(reviews ?? []).map((r) => {
          const book = r.catalog_items as unknown as { title: string } | null;
          const approveForReview = approveBookReview.bind(null, r.id);
          const declineForReview = declineBookReview.bind(null, r.id);
          return (
            <Card key={r.id} className="max-w-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-heading font-bold text-neutral-900">
                    {book?.title ?? "Unknown book"}
                  </h2>
                  <p className="text-sm text-amber-500">
                    {"★".repeat(r.rating)}
                    {"☆".repeat(5 - r.rating)}{" "}
                    <span className="text-neutral-600">
                      {r.reviewer_name} — {r.reviewer_email}
                    </span>
                  </p>
                  {r.review_text && (
                    <p className="mt-1 text-sm text-neutral-700">{r.review_text}</p>
                  )}
                </div>
                <Badge tone={statusTone(r.status)}>{r.status}</Badge>
              </div>

              {r.status === "pending" && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <form action={approveForReview}>
                    <Button type="submit" size="sm">
                      Approve
                    </Button>
                  </form>
                  <form action={declineForReview} className="flex flex-1 gap-2">
                    <Input name="admin_note" placeholder="Reason (optional)" className="flex-1" />
                    <Button type="submit" size="sm" variant="outline">
                      Decline
                    </Button>
                  </form>
                </div>
              )}

              {r.status === "declined" && r.admin_note && (
                <p className="mt-2 text-sm text-neutral-600">Reason: {r.admin_note}</p>
              )}
            </Card>
          );
        })}
        {(reviews ?? []).length === 0 && (
          <p className="text-sm text-neutral-500">No book reviews yet.</p>
        )}
      </div>
    </div>
  );
}
