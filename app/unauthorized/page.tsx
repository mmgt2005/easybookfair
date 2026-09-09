export default function UnauthorizedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-2 px-6">
      <h1 className="text-xl font-semibold">Not authorized</h1>
      <p className="text-neutral-600">
        Your account isn&apos;t a platform admin. Ask an existing admin to add
        your user id to <code>platform_admins</code>.
      </p>
    </main>
  );
}
