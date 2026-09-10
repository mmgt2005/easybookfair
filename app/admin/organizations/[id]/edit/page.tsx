import { createClient } from "@/lib/supabase/server";
import { updateOrganization } from "../../actions";

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
      <h1 className="text-lg font-semibold">Edit organization</h1>
      <form action={updateOrganizationForOrg} className="flex max-w-sm flex-col gap-2">
        <input
          name="name"
          required
          defaultValue={org.name}
          placeholder="Organization name"
          className="rounded border border-neutral-300 px-2 py-1"
        />
        <input
          name="contact_name"
          defaultValue={org.contact_name ?? ""}
          placeholder="Contact name"
          className="rounded border border-neutral-300 px-2 py-1"
        />
        <input
          name="contact_email"
          type="email"
          defaultValue={org.contact_email ?? ""}
          placeholder="Contact email"
          className="rounded border border-neutral-300 px-2 py-1"
        />
        <label className="text-xs text-neutral-600">
          Status
          <select
            name="status"
            defaultValue={org.status}
            className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1"
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="declined">Declined</option>
          </select>
        </label>
        <p className="text-xs text-neutral-500">
          Stripe Connect: charges {org.stripe_charges_enabled ? "enabled" : "not enabled"},
          payouts {org.stripe_payouts_enabled ? "enabled" : "not enabled"}. Not editable here —
          these only get set by Stripe&apos;s own webhook once Connect onboarding
          (Phase 3) confirms them, never by hand.
        </p>
        <button type="submit" className="rounded bg-neutral-900 px-3 py-1.5 text-white">
          Save changes
        </button>
      </form>
    </div>
  );
}
