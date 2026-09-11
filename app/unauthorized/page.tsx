import { Card } from "@/components/ui";

export default function UnauthorizedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-3 px-6">
      <h1 className="font-heading text-2xl font-bold text-primary-600">Not authorized 🔒</h1>
      <Card>
        <p className="text-neutral-600">
          Your account isn&apos;t a platform admin. Ask an existing admin to add
          your user id to <code>platform_admins</code>.
        </p>
      </Card>
    </main>
  );
}
