import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAdmin();

  return (
    <div className="min-h-screen">
      <nav className="flex gap-4 border-b border-neutral-200 px-6 py-3 text-sm">
        <Link href="/admin" className="font-semibold">
          EasyBookFair Admin
        </Link>
        <Link href="/admin/catalog" className="text-neutral-600 hover:text-neutral-900">
          Catalog
        </Link>
        <Link href="/admin/organizations" className="text-neutral-600 hover:text-neutral-900">
          Organizations
        </Link>
        <Link href="/admin/fairs" className="text-neutral-600 hover:text-neutral-900">
          Fairs
        </Link>
        <Link href="/admin/carton-specs" className="text-neutral-600 hover:text-neutral-900">
          Carton specs
        </Link>
      </nav>
      <div className="px-6 py-6">{children}</div>
    </div>
  );
}
