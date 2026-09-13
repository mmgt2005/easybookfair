import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getViewAsOrgId, getViewAsAuthorId } from "@/lib/viewAs";
import { stopViewAs } from "./view-as/actions";
import { Tour, TourLauncherButton } from "@/components/Tour";
import packageJson from "@/package.json";

const navLinks = [
  { href: "/admin/catalog", label: "Catalog" },
  { href: "/admin/organizations", label: "Organizations" },
  { href: "/admin/authors", label: "Authors" },
  { href: "/admin/fairs", label: "Fairs" },
  { href: "/admin/fair-requests", label: "Fair requests" },
  { href: "/admin/org-signups", label: "Org signups" },
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
    title: "Org signups",
    description:
      "A new organization can express interest at /join with no account. Approving here creates the organization, invites the contact, and adds them as org staff.",
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

  // A view-as cookie can still be set even while browsing /admin itself
  // (an admin who wandered back without clicking "Stop viewing as") —
  // surface it here too, not just on /org or /author, so it's never
  // silently active in the background.
  const [viewAsOrgId, viewAsAuthorId] = await Promise.all([
    getViewAsOrgId(),
    getViewAsAuthorId(),
  ]);
  let viewingAsLabel: string | null = null;
  if (viewAsOrgId) {
    const supabase = await createClient();
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", viewAsOrgId)
      .single();
    viewingAsLabel = `org "${org?.name ?? viewAsOrgId}"`;
  } else if (viewAsAuthorId) {
    const supabase = await createClient();
    const { data: author } = await supabase
      .from("authors")
      .select("name")
      .eq("user_id", viewAsAuthorId)
      .single();
    viewingAsLabel = `author "${author?.name ?? viewAsAuthorId}"`;
  }

  return (
    <div className="min-h-screen">
      {viewingAsLabel && (
        <div className="flex items-center justify-between gap-3 bg-amber-100 px-6 py-2 text-sm text-amber-900">
          <span>
            👁️ Still viewing as {viewingAsLabel} — visit <code>/org</code> or <code>/author</code>{" "}
            to continue, or stop here.
          </span>
          <form action={stopViewAs}>
            <button type="submit" className="font-semibold underline hover:no-underline">
              Stop viewing as
            </button>
          </form>
        </div>
      )}
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
