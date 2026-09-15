import { createClient } from "@/lib/supabase/server";
import { approveEventRequest, declineEventRequest } from "./actions";
import { Badge, Button, Card, Input, PageHeader, statusTone } from "@/components/ui";

export default async function EventRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorMessage } = await searchParams;
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from("event_requests")
    .select(
      "id, event_type, requested_date, notes, status, admin_note, submitted_by_admin_id, catalog_item_id, organizations(name), fairs(name), catalog_items(title)",
    )
    .order("created_at", { ascending: false });

  const catalogItemIds = [...new Set((requests ?? []).map((r) => r.catalog_item_id))];
  const { data: authorRows } =
    catalogItemIds.length > 0
      ? await supabase
          .from("author_submissions")
          .select("catalog_item_id, author_name, author_email")
          .in("catalog_item_id", catalogItemIds)
          .eq("status", "approved")
      : { data: [] };
  const authorByItem = new Map((authorRows ?? []).map((a) => [a.catalog_item_id, a]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Event requests 🖋️"
        description="Author reading / book signing requests submitted by organizations. Approving lets the org know — coordinate the details directly with the author."
      />

      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}

      <div className="flex flex-col gap-4">
        {(requests ?? []).map((request) => {
          const org = request.organizations as unknown as { name: string } | null;
          const fair = request.fairs as unknown as { name: string } | null;
          const book = request.catalog_items as unknown as { title: string } | null;
          const author = authorByItem.get(request.catalog_item_id);
          const approveForRequest = approveEventRequest.bind(null, request.id);
          const declineForRequest = declineEventRequest.bind(null, request.id);

          return (
            <Card key={request.id} className="max-w-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-heading font-bold text-neutral-900">
                    {book?.title} —{" "}
                    {request.event_type === "author_reading" ? "Author reading" : "Book signing"}
                  </h2>
                  <p className="text-sm text-neutral-600">
                    {org?.name} — {fair?.name}
                  </p>
                  <p className="text-sm text-neutral-600">
                    Requested date: {request.requested_date ?? "TBD"}
                  </p>
                  {request.notes && (
                    <p className="mt-1 text-xs text-neutral-500">Notes: {request.notes}</p>
                  )}
                  <p className="mt-1 text-xs text-neutral-500">
                    {author
                      ? `🖋️ Author: ${author.author_name} — ${author.author_email}`
                      : "No author on file — item was admin-added."}
                  </p>
                  {request.submitted_by_admin_id && (
                    <p className="mt-1 text-xs text-amber-700">
                      👁️ Submitted by an admin viewing as this org, not the org itself.
                    </p>
                  )}
                </div>
                <Badge tone={statusTone(request.status)}>{request.status}</Badge>
              </div>

              {request.status === "pending" && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <form action={approveForRequest}>
                    <Button type="submit" size="sm">
                      Approve
                    </Button>
                  </form>
                  <form action={declineForRequest} className="flex flex-1 gap-2">
                    <Input name="admin_note" placeholder="Reason (optional)" className="flex-1" />
                    <Button type="submit" size="sm" variant="outline">
                      Decline
                    </Button>
                  </form>
                </div>
              )}

              {request.status === "declined" && request.admin_note && (
                <p className="mt-2 text-sm text-neutral-600">Reason: {request.admin_note}</p>
              )}
            </Card>
          );
        })}
        {(requests ?? []).length === 0 && (
          <p className="text-sm text-neutral-500">No event requests yet.</p>
        )}
      </div>
    </div>
  );
}
