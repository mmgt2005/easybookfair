import { createClient } from "@/lib/supabase/server";
import { approveFairRequest, declineFairRequest } from "./actions";
import { Badge, Button, Card, Input, PageHeader, statusTone } from "@/components/ui";

export default async function FairRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorMessage } = await searchParams;
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from("fair_requests")
    .select(
      "id, requested_name, requested_start_date, requested_end_date, allow_online, allow_wallet, allow_in_person, allow_cash, status, admin_note, submitted_by_admin_id, organizations(name)",
    )
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Fair requests 📝"
        description="Requests submitted by organizations from their portal. Approving creates the real, scheduled fair."
      />

      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}

      <div className="flex flex-col gap-4">
        {(requests ?? []).map((request) => {
          const org = request.organizations as unknown as { name: string } | null;
          const approveForRequest = approveFairRequest.bind(null, request.id);
          const declineForRequest = declineFairRequest.bind(null, request.id);
          const channels = [
            request.allow_in_person && "In-person reader",
            request.allow_online && "Online storefront",
            request.allow_wallet && "Student wallets",
            request.allow_cash && "Cash",
          ].filter(Boolean);

          return (
            <Card key={request.id} className="max-w-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-heading font-bold text-neutral-900">
                    {request.requested_name}
                  </h2>
                  <p className="text-sm text-neutral-600">{org?.name}</p>
                  <p className="text-sm text-neutral-600">
                    {request.requested_start_date} – {request.requested_end_date}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Payment options requested: {channels.join(", ") || "none"}
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
                  <form action={approveForRequest} className="flex items-center gap-2">
                    {request.allow_in_person && (
                      <label className="flex items-center gap-1 text-xs text-neutral-600">
                        Reader rental fee $
                        <Input
                          name="equipment_rental_fee"
                          type="number"
                          step="0.01"
                          min={0}
                          defaultValue="25.00"
                          className="w-20"
                        />
                      </label>
                    )}
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
          <p className="text-sm text-neutral-500">No fair requests yet.</p>
        )}
      </div>
    </div>
  );
}
