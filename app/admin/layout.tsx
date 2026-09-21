import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getViewAsOrgId, getViewAsAuthorId } from "@/lib/viewAs";
import { stopViewAs } from "./view-as/actions";
import { Tour, TourLauncherButton } from "@/components/Tour";
import { SiteNav, type NavGroup } from "@/components/nav/SiteNav";
import packageJson from "@/package.json";

// Grouped so the nav can render dropdowns instead of ~13 links in a flat
// row — a group with a single link (e.g. Settings for a non-super-admin,
// see below) renders as a plain link instead of a one-item dropdown.
const navGroups: NavGroup[] = [
  {
    label: "Fairs",
    links: [
      { href: "/admin/fairs", label: "Fairs" },
      { href: "/admin/fair-requests", label: "Fair requests" },
      { href: "/admin/event-requests", label: "Event requests" },
      { href: "/admin/demo", label: "Demo fair" },
    ],
  },
  {
    label: "Catalog & authors",
    links: [
      { href: "/admin/catalog", label: "Catalog" },
      { href: "/admin/authors", label: "Authors" },
      { href: "/admin/author-submissions", label: "Author submissions" },
    ],
  },
  {
    label: "Organizations",
    links: [
      { href: "/admin/organizations", label: "Organizations" },
      { href: "/admin/org-signups", label: "Org signups" },
    ],
  },
  {
    label: "Setup",
    links: [
      { href: "/admin/carton-specs", label: "Carton specs" },
      { href: "/admin/label-templates", label: "Label templates" },
    ],
  },
  {
    label: "Settings",
    links: [{ href: "/admin/manual", label: "Manual" }],
  },
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
    title: "Authors",
    description:
      "Accounts created automatically once you approve a submission at Author submissions — no manual invite step. \"View as\" lets you preview an author's own portal.",
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
    title: "Event requests",
    description:
      "Orgs can request an author reading or book signing for a book already allocated to one of their fairs. Approving lets the org know — you coordinate the actual event with the author yourself.",
  },
  {
    title: "Org signups",
    description:
      "A new organization can express interest at /join with no account. Approving here creates the organization, invites the contact, and adds them as org staff.",
  },
  {
    title: "Author submissions",
    description:
      "Books and merchandise submitted from the public form at /author/submit, with a suggested price and wholesale cost computed automatically. Approving invites the author to a real account and adds the item to the catalog.",
  },
  {
    title: "Carton specs",
    description:
      "Box dimensions used to suggest how to pack an allocation for shipping — reference data, set up once and reused across fairs.",
  },
  {
    title: "Label templates",
    description:
      "Sheet/label geometry (dimensions, margins, gaps, grid) for whatever label sheets you actually have — configure once, then pick it when printing labels for a fair's allocation.",
  },
  {
    title: "Demo fair",
    description:
      "A permanent, resettable sandbox fair for training — click through catalog, allocation, checkout, the storefront, and student wallets without touching real data.",
  },
  {
    title: "Admins",
    description:
      "Invite another platform admin, or promote/demote an existing one. Only visible here if you're a super admin — everyone else can't see or use it.",
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
  const { role } = await requireAdmin();
  const groups = navGroups.map((group) => ({ ...group, links: [...group.links] }));
  if (role === "super_admin") {
    const settings = groups.find((g) => g.label === "Settings")!;
    settings.links.unshift({ href: "/admin/platform-admins", label: "Admins" });
  }

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
        <div className="flex items-center justify-between gap-3 bg-amber-100 px-6 py-2 text-sm text-amber-900 print:hidden">
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
      <SiteNav
        brand={{ href: "/admin", label: "📚 EasyBookFair Admin" }}
        versionBadge={`v${packageJson.version}`}
        items={groups}
        trailing={<TourLauncherButton storageKey="admin_v1" />}
      />
      <div className="px-6 py-6 print:p-0">{children}</div>
      <div className="print:hidden">
        <Tour storageKey="admin_v1" steps={adminTourSteps} />
      </div>
    </div>
  );
}
