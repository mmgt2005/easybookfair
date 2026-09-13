import { requireOrgStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createFairRequest } from "../../actions";
import { Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";

export default async function RequestFairPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { orgIds } = await requireOrgStaff();
  const { error: errorMessage } = await searchParams;
  const supabase = await createClient();

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, is_school")
    .in("id", orgIds);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Request a fair 🎪"
        description="Submitted requests are reviewed by a platform admin before becoming a real, scheduled fair."
      />

      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}

      <Card className="max-w-lg">
        <form action={createFairRequest} className="flex flex-col gap-3">
          {orgs && orgs.length > 1 ? (
            <Field label="Organization">
              <Select name="org_id" required defaultValue="">
                <option value="" disabled>
                  Select organization…
                </option>
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <input type="hidden" name="org_id" value={orgs?.[0]?.id ?? ""} />
          )}

          <Field label="Fair name">
            <Input name="requested_name" required placeholder="Spring Book Fair 2027" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Start date">
              <Input name="requested_start_date" type="date" required />
            </Field>
            <Field label="End date">
              <Input name="requested_end_date" type="date" required />
            </Field>
          </div>
          <Field label="Return deadline" hint="When unsold inventory is due back">
            <Input name="requested_return_deadline" type="date" required />
          </Field>

          <div className="flex flex-col gap-3 rounded-lg bg-neutral-50 p-3">
            <p className="text-xs font-semibold text-neutral-700">
              Choose which ways buyers can pay at this fair. Each is explained below — pick as
              many as make sense for your event.
            </p>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="allow_in_person" defaultChecked className="mt-1" />
              <span>
                <strong className="text-neutral-800">In-person card reader</strong>
                <span className="block text-xs text-neutral-500">
                  A volunteer rings up sales at a table using a physical Stripe card reader.
                  Requires setting up a Stripe Terminal reader once the fair is approved
                  (internet-connected readers only — see the manual). An equipment rental fee
                  (set by the admin at approval) applies and is deducted from your payout when
                  the fair closes.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="allow_online" defaultChecked className="mt-1" />
              <span>
                <strong className="text-neutral-800">Online storefront</strong>
                <span className="block text-xs text-neutral-500">
                  Buyers browse and pay online ahead of time from any device, then pick up their
                  order at the fair — nothing ships. No account needed on their end.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="allow_wallet"
                disabled={!orgs?.some((o) => o.is_school)}
                className="mt-1"
              />
              <span>
                <strong className="text-neutral-800">Student wallets</strong>
                <span className="block text-xs text-neutral-500">
                  {orgs?.some((o) => o.is_school)
                    ? "Parents preload money onto their child's own balance online; the child then shops the fair independently by giving their name at checkout — no cash, no card. Unspent balance becomes an additional donation to your organization, not a refund."
                    : "Only available for organizations marked \"a school\" — ask a platform admin to enable that for your organization first."}
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="allow_cash" defaultChecked className="mt-1" />
              <span>
                <strong className="text-neutral-800">Cash</strong>
                <span className="block text-xs text-neutral-500">
                  Buyers pay with physical cash at the table, same as a traditional book fair.
                </span>
              </span>
            </label>
          </div>

          <Button type="submit">Submit request</Button>
        </form>
      </Card>
    </div>
  );
}
