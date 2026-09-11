import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

const navLinks = [
  { href: "/admin/catalog", label: "Catalog" },
  { href: "/admin/organizations", label: "Organizations" },
  { href: "/admin/fairs", label: "Fairs" },
  { href: "/admin/carton-specs", label: "Carton specs" },
];

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAdmin();

  return (
    <div className="min-h-screen">
      <nav className="flex flex-wrap items-center gap-5 border-b-2 border-primary-100 bg-white px-6 py-3 text-sm">
        <Link href="/admin" className="font-heading text-lg font-bold text-primary-600">
          📚 EasyBookFair Admin
        </Link>
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="font-semibold text-neutral-600 hover:text-accent-600"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="px-6 py-6">{children}</div>
    </div>
  );
}
