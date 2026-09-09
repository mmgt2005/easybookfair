import { createClient } from "@/lib/supabase/server";
import { createOrganization } from "./actions";

export default async function OrganizationsPage() {
  const supabase = await createClient();
  const { data: organizations, error } = await supabase
    .from("organizations")
    .select("id, name, contact_name, contact_email, status")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Organizations</h1>
      <p className="text-sm text-neutral-600">
        Scaffolding for Phase 2 — creates an already-approved org directly.
        The real application review (approve/decline, Stripe Connect
        onboarding) is Phase 3.
      </p>

      {error && <p className="text-sm text-red-600">{error.message}</p>}

      <table className="w-full max-w-2xl text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left">
            <th className="py-1 pr-4">Name</th>
            <th className="py-1 pr-4">Contact</th>
            <th className="py-1 pr-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {organizations?.map((org) => (
            <tr key={org.id} className="border-b border-neutral-100">
              <td className="py-1 pr-4">{org.name}</td>
              <td className="py-1 pr-4">
                {org.contact_name} {org.contact_email && `<${org.contact_email}>`}
              </td>
              <td className="py-1 pr-4">{org.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <form action={createOrganization} className="flex max-w-sm flex-col gap-2">
        <h2 className="font-medium">New organization</h2>
        <input
          name="name"
          required
          placeholder="Organization name"
          className="rounded border border-neutral-300 px-2 py-1"
        />
        <input
          name="contact_name"
          placeholder="Contact name"
          className="rounded border border-neutral-300 px-2 py-1"
        />
        <input
          name="contact_email"
          type="email"
          placeholder="Contact email"
          className="rounded border border-neutral-300 px-2 py-1"
        />
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-1.5 text-white"
        >
          Create
        </button>
      </form>
    </div>
  );
}
