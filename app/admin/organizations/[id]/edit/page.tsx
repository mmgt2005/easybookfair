import { createClient } from "@/lib/supabase/server";
import { updateOrganization, startStripeOnboarding } from "../../actions";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

export default async function EditOrganizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; stripe?: string }>;
}) {
  const { id } = await params;
  const { error: errorMessage, stripe: stripeStatus } = await searchParams;
  const supabase = await createClient();

  const { data: org, error } = await supabase
    .from("organizations")
    .select(
      "id, name, contact_name, contact_email, status, stripe_connect_account_id, stripe_charges_enabled, stripe_payouts_enabled",
    )
    .eq("id", id)
    .single();

  if (error || !org) {
    return <p className="text-sm text-red-600">Organization not found.</p>;
  }

  const updateOrganizationForOrg = updateOrganization.bind(null, id);
  const startStripeOnboardingForOrg = startStripeOnboarding.bind(null, id);
  const fullyOnboarded = org.stripe_charges_enabled && org.stripe_payouts_enabled;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold text-neutral-900">Edit organization 🏫</h1>

      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}
      {stripeStatus === "return" && (
        <p className="rounded-xl bg-accent-50 px-3 py-2 text-sm text-accent-700">
          Back from Stripe. Charges/payouts status below updates once Stripe&apos;s webhook
          confirms it — refresh in a moment if it still shows &quot;not enabled&quot;.
        </p>
      )}
      {stripeStatus === "refresh" && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
          That onboarding link expired — click the button below to get a new one.
        </p>
      )}

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
          <Button type="submit">Save changes</Button>
        </form>
      </Card>

      <Card className="max-w-sm">
        <h2 className="font-heading font-bold text-neutral-900">Stripe Connect</h2>
        <div className="mt-2 flex flex-col gap-1 text-sm text-neutral-600">
          <div className="flex items-center gap-2">
            Charges:{" "}
            <Badge tone={org.stripe_charges_enabled ? "success" : "warning"}>
              {org.stripe_charges_enabled ? "enabled" : "not enabled"}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            Payouts:{" "}
            <Badge tone={org.stripe_payouts_enabled ? "success" : "warning"}>
              {org.stripe_payouts_enabled ? "enabled" : "not enabled"}
            </Badge>
          </div>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          These only ever get set by Stripe&apos;s own webhook once onboarding actually
          confirms them, never by hand — not just because the org clicked the link.
        </p>
        <form action={startStripeOnboardingForOrg} className="mt-3">
          <Button type="submit" size="sm" variant="secondary">
            {fullyOnboarded
              ? "Update Stripe details"
              : org.stripe_connect_account_id
                ? "Continue Stripe onboarding"
                : "Start Stripe onboarding"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
