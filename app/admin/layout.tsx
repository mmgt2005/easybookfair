import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { Tour, TourLauncherButton } from "@/components/Tour";
import packageJson from "@/package.json";

const navLinks = [
  { href: "/admin/catalog", label: "Catalog" },
  { href: "/admin/organizations", label: "Organizations" },
  { href: "/admin/fairs", label: "Fairs" },
  { href: "/admin/fair-requests", label: "Fair requests" },
  { href: "/admin/author-submissions", label: "Author submissions" },
  { href: "/admin/carton-specs", label: "Carton specs" },
  { href: "/admin/demo", label: "Demo fair" },
  { href: "/admin/manual", label: "Manual" },
];

const adminTourSteps = [
  {
    title: "Welcome to the EasyBookFair admin 👋",
    description:
      "This is where you manage the catalog, organizations, and fairs across the whole platform.",
  },
  {
    title: "Catalog",
    description:
      "Add books and merchandise, set prices, upload cover images, and track stock on hand.",
  },
  {
    title: "Organizations",
    description:
      "Approve organizations, mark schools (unlocks student wallets for their fairs), and connect Stripe for payouts.",
  },
  {
    title: "Fairs",
    description: "Create fairs directly, allocate stock, run checkout, and close them out.",
  },
  {
    title: "Fair requests",
    description:
      "Orgs request fairs from their own portal, picking payment options. Approving here copies those choices into a real, scheduled fair.",
  },
  {
    title: "Manual",
    description: "Full usage docs and the changelog live here any time you need them.",
  },
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
        <TourLauncherButton storageKey="admin_v1" />
      </nav>
      <div className="px-6 py-6">{children}</div>
      <Tour storageKey="admin_v1" steps={adminTourSteps} />
    </div>
  );
}
