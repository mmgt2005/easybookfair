import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createOrganization } from "./actions";
import { Badge, Button, Card, Input, PageHeader, statusTone } from "@/components/ui";

export default async function OrganizationsPage() {
  const supabase = await createClient();
  const { data: organizations, error } = await supabase
    .from("organizations")
    .select("id, name, contact_name, contact_email, status")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Organizations 🏫"
        description="Scaffolding for Phase 2 — creates an already-approved org directly. The real application review (approve/decline, Stripe Connect onboarding) is Phase 3."
      />

      {error && <p className="text-sm text-red-600">{error.message}</p>}

      <Card className="overflow-x-auto p-0">
        <table className="w-full max-w-2xl text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
              <th className="py-2 pl-4 pr-4">Name</th>
              <th className="py-2 pr-4">Contact</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {organizations?.map((org) => (
              <tr key={org.id} className="border-b border-neutral-50 last:border-0">
                <td className="py-2 pl-4 pr-4 font-semibold text-neutral-800">{org.name}</td>
                <td className="py-2 pr-4 text-neutral-600">
                  {org.contact_name} {org.contact_email && `<${org.contact_email}>`}
                </td>
                <td className="py-2 pr-4">
                  <Badge tone={statusTone(org.status)}>{org.status}</Badge>
                </td>
                <td className="py-2 pr-4">
                  <Link
                    href={`/admin/organizations/${org.id}/edit`}
                    className="font-semibold text-accent-600 hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="max-w-sm">
        <form action={createOrganization} className="flex flex-col gap-3">
          <h2 className="font-heading font-bold text-neutral-900">New organization</h2>
          <Input name="name" required placeholder="Organization name" />
          <Input name="contact_name" placeholder="Contact name" />
          <Input name="contact_email" type="email" placeholder="Contact email" />
          <Button type="submit">Create</Button>
        </form>
      </Card>
    </div>
  );
}
