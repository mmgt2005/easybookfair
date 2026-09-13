import Link from "next/link";
import { requireOrgStaff } from "@/lib/auth";
import packageJson from "@/package.json";

const navLinks = [
  { href: "/org", label: "Dashboard" },
  { href: "/org/fairs/request", label: "Request a fair" },
];

export default async function OrgLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireOrgStaff();

  return (
    <div className="min-h-screen">
      <nav className="flex flex-wrap items-center gap-5 border-b-2 border-primary-100 bg-white px-6 py-3 text-sm">
        <Link href="/org" className="font-heading text-lg font-bold text-primary-600">
          📚 EasyBookFair — Org Portal
        </Link>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-500">
          v{packageJson.version}
        </span>
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
