import { requireOrgStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { inviteOrgStaff, updateOrgMemberRole } from "./actions";
import { Badge, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";

export default async function OrgStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { orgIds, orgAdminOrgIds } = await requireOrgStaff();
  const { error: errorMessage } = await searchParams;
  const supabase = await createClient();
  const service = createServiceClient();

  // Explicit org_id filter, not just RLS, for the same reason as the rest
  // of this portal (app/org/page.tsx) — an admin "viewing as" this org
  // has full RLS visibility, so without it they'd see every org's members.
  const [{ data: orgs }, { data: members }] = await Promise.all([
    supabase.from("organizations").select("id, name").in("id", orgIds).order("name"),
    supabase
      .from("org_members")
      .select("org_id, user_id, role, created_at")
      .in("org_id", orgIds)
      .order("created_at"),
  ]);

  const membersWithEmail = await Promise.all(
    (members ?? []).map(async (member) => {
      const { data } = await service.auth.admin.getUserById(member.user_id);
      return { ...member, email: data.user?.email ?? "(unknown)" };
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Staff 🧑‍💼"
        description="Everyone with access to your organization's fairs. Only an org admin can invite someone new or change a role."
      />

      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}

      {(orgs ?? []).map((org) => {
        const canManage = orgAdminOrgIds.includes(org.id);
        const orgMembers = membersWithEmail.filter((m) => m.org_id === org.id);
        const inviteForOrg = inviteOrgStaff.bind(null, org.id);

        return (
          <div key={org.id} className="flex flex-col gap-4">
            <h2 className="font-heading text-lg font-bold text-neutral-900">{org.name}</h2>

            <Card className="overflow-x-auto p-0">
              <table className="w-full max-w-2xl text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
                    <th className="py-2 pl-4 pr-4">Email</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Since</th>
                    {canManage && <th className="py-2 pr-4" />}
                  </tr>
                </thead>
                <tbody>
                  {orgMembers.map((member) => (
                    <tr key={member.user_id} className="border-b border-neutral-50 last:border-0">
                      <td className="py-2 pl-4 pr-4 font-semibold text-neutral-800">
                        {member.email}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge tone={member.role === "org_admin" ? "info" : "neutral"}>
                          {member.role === "org_admin" ? "org admin" : "org staff"}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-neutral-600">
                        {new Date(member.created_at).toLocaleDateString()}
                      </td>
                      {canManage && (
                        <td className="py-2 pr-4">
                          <form
                            action={updateOrgMemberRole.bind(null, org.id, member.user_id)}
                          >
                            <input
                              type="hidden"
                              name="role"
                              value={member.role === "org_admin" ? "org_staff" : "org_admin"}
                            />
                            <button
                              type="submit"
                              className="font-semibold text-accent-600 hover:underline"
                            >
                              {member.role === "org_admin" ? "Demote to staff" : "Promote to admin"}
                            </button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                  {orgMembers.length === 0 && (
                    <tr>
                      <td colSpan={canManage ? 4 : 3} className="py-4 pl-4 text-neutral-500">
                        No staff yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>

            {canManage && (
              <Card className="max-w-sm">
                <form action={inviteForOrg} className="flex flex-col gap-3">
                  <h3 className="font-heading font-bold text-neutral-900">Invite staff</h3>
                  <Field label="Email">
                    <Input name="email" type="email" required />
                  </Field>
                  <Field
                    label="Role"
                    hint="Re-inviting someone already listed above just changes their role."
                  >
                    <Select name="role" defaultValue="org_staff">
                      <option value="org_staff">Org staff</option>
                      <option value="org_admin">Org admin</option>
                    </Select>
                  </Field>
                  <Button type="submit">Send invite</Button>
                </form>
              </Card>
            )}
          </div>
        );
      })}
    </div>
  );
}
