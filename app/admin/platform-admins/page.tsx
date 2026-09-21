import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { inviteAdmin, setAdminRole } from "./actions";
import { Badge, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";

export default async function PlatformAdminsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireSuperAdmin();
  const { error: errorMessage } = await searchParams;
  const supabase = await createClient();
  const service = createServiceClient();

  const { data: admins } = await supabase
    .from("platform_admins")
    .select("user_id, role, created_at")
    .order("created_at");

  const withEmails = await Promise.all(
    (admins ?? []).map(async (admin) => {
      const { data } = await service.auth.admin.getUserById(admin.user_id);
      return { ...admin, email: data.user?.email ?? "(unknown)" };
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Admins 🔑"
        description="Every existing admin was promoted to super admin when this screen shipped. Only a super admin can invite another admin or change anyone's role."
      />

      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full max-w-2xl text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left">
              <th className="py-2 pl-4 pr-4">Email</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Since</th>
              <th className="py-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {withEmails.map((admin) => (
              <tr key={admin.user_id} className="border-b border-neutral-50 last:border-0">
                <td className="py-2 pl-4 pr-4 font-semibold text-neutral-800">{admin.email}</td>
                <td className="py-2 pr-4">
                  <Badge tone={admin.role === "super_admin" ? "info" : "neutral"}>
                    {admin.role === "super_admin" ? "super admin" : "admin"}
                  </Badge>
                </td>
                <td className="py-2 pr-4 text-neutral-600">
                  {new Date(admin.created_at).toLocaleDateString()}
                </td>
                <td className="py-2 pr-4">
                  <form action={setAdminRole.bind(null, admin.user_id)}>
                    <input
                      type="hidden"
                      name="role"
                      value={admin.role === "super_admin" ? "admin" : "super_admin"}
                    />
                    <button type="submit" className="font-semibold text-accent-600 hover:underline">
                      {admin.role === "super_admin" ? "Demote to admin" : "Promote to super admin"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {withEmails.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 pl-4 text-neutral-500">
                  No admins yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="max-w-sm">
        <form action={inviteAdmin} className="flex flex-col gap-3">
          <h2 className="font-heading font-bold text-neutral-900">Invite an admin</h2>
          <Field label="Email">
            <Input name="email" type="email" required />
          </Field>
          <Field
            label="Role"
            hint="Re-inviting someone already listed above just changes their role."
          >
            <Select name="role" defaultValue="admin">
              <option value="admin">Admin</option>
              <option value="super_admin">Super admin</option>
            </Select>
          </Field>
          <Button type="submit">Send invite</Button>
        </form>
      </Card>
    </div>
  );
}
