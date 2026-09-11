import { createClient } from "@/lib/supabase/server";
import { updateOrganization } from "../../actions";
import { Button, Card, Field, Input, Select } from "@/components/ui";

export default async function EditOrganizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: org, error } = await supabase
    .from("organizations")
    .select("id, name, contact_name, contact_email, status, stripe_charges_enabled, stripe_payouts_enabled")
    .eq("id", id)
    .single();

  if (error || !org) {
    return <p className="text-sm text-red-600">Organization not found.</p>;
  }

  const updateOrganizationForOrg = updateOrganization.bind(null, id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold text-neutral-900">Edit organization 🏫</h1>
      <Card className="max-w-sm">
        <form action={updateOrganizationForOrg} className="flex flex-col gap-3">
          <Input name="name" required defaultValue={org.name} placeholder="Organization name" />
          <Input name="contact_name" defaultValue={org.contact_name ?? ""} placeholder="Contact name" />
          <Input
            name="contact_email"
            type="email"
            defaultValue={org.contact_email ?? ""}
            placeholder="Contact email"
          />
          <Field label="Status">
            <Select name="status" defaultValue={org.status}>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="declined">Declined</option>
            </Select>
          </Field>
          <p className="text-xs text-neutral-500">
            Stripe Connect: charges {org.stripe_charges_enabled ? "enabled" : "not enabled"},
            payouts {org.stripe_payouts_enabled ? "enabled" : "not enabled"}. Not editable here —
            these only get set by Stripe&apos;s own webhook once Connect onboarding
            (Phase 3) confirms them, never by hand.
          </p>
          <Button type="submit">Save changes</Button>
        </form>
      </Card>
    </div>
  );
}
