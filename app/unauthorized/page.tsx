import { Card } from "@/components/ui";

export default function UnauthorizedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-3 px-6">
      <h1 className="font-heading text-2xl font-bold text-primary-600">Not authorized 🔒</h1>
      <Card>
        <p className="text-neutral-600">
          Your account isn&apos;t set up for either area of this app. For
          admin access, ask an existing admin to add your user id to{" "}
          <code>platform_admins</code>; for an organization&apos;s portal,
          ask a platform admin to add you to <code>org_members</code> for
          your organization.
        </p>
      </Card>
    </main>
  );
}
