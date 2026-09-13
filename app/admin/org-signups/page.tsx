import { createClient } from "@/lib/supabase/server";
import { approveOrgSignup, declineOrgSignup } from "./actions";
import { Badge, Button, Card, Input, PageHeader, statusTone } from "@/components/ui";

export default async function OrgSignupsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorMessage } = await searchParams;
  const supabase = await createClient();

  const { data: signups } = await supabase
    .from("org_signups")
    .select(
      "id, org_name, contact_name, contact_email, is_school, message, status, admin_note, created_at",
    )
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Organization signups 🏫"
        description="Submitted from the public form (/join). Approving creates the organization, invites the contact to a real account, and adds them as org staff."
      />

      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}

      <div className="flex flex-col gap-4">
        {(signups ?? []).map((s) => {
          const approveForSignup = approveOrgSignup.bind(null, s.id);
          const declineForSignup = declineOrgSignup.bind(null, s.id);
          return (
            <Card key={s.id} className="max-w-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-heading font-bold text-neutral-900">
                    {s.org_name} {s.is_school && <span className="text-xs">🎓 school</span>}
                  </h2>
                  <p className="text-sm text-neutral-600">
                    {s.contact_name} — {s.contact_email}
                  </p>
                  {s.message && <p className="mt-1 text-sm text-neutral-600">{s.message}</p>}
                </div>
                <Badge tone={statusTone(s.status)}>{s.status}</Badge>
              </div>

              {s.status === "pending" && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <form action={approveForSignup}>
                    <Button type="submit" size="sm">
                      Approve
                    </Button>
                  </form>
                  <form action={declineForSignup} className="flex flex-1 gap-2">
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
        {(signups ?? []).length === 0 && (
          <p className="text-sm text-neutral-500">No organization signups yet.</p>
        )}
      </div>
    </div>
  );
}
