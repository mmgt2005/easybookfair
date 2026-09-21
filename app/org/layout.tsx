import Link from "next/link";
import { requireOrgStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Tour, TourLauncherButton } from "@/components/Tour";
import { ViewAsBanner } from "@/components/ViewAsBanner";
import packageJson from "@/package.json";

const navLinks = [
  { href: "/org", label: "Dashboard" },
  { href: "/org/fairs/request", label: "Request a fair" },
  { href: "/org/events/request", label: "Request an event" },
  { href: "/org/staff", label: "Staff" },
];

const orgTourSteps = [
  {
    title: "Welcome to your org portal 👋",
    description:
      "From here you request fairs and track their status — no more emailing back and forth with a platform admin.",
  },
  {
    title: "Dashboard",
    description:
      "See your organization's fairs (with shareable buyer links once approved) and the status of every request you've submitted.",
  },
  {
    title: "Request a fair",
    description:
      "Pick dates and which ways buyers can pay — each option is explained before you choose. An admin reviews the request before it becomes a real fair.",
  },
  {
    title: "Request an event",
    description:
      "Ask for an author reading or book signing for a book already allocated to one of your fairs. An admin reviews it and coordinates the details with the author.",
  },
  {
    title: "Staff",
    description:
      "Everyone with access to your fairs. If you're an org admin, invite new staff by email and pick their role — org admins can invite too, org staff can't.",
  },
  {
    title: "Come back to this any time",
    description:
      "Click \"🎓 Take the tour\" in the nav whenever you want to see this again — it doesn't go away after the first time.",
  },
];

export default async function OrgLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { orgIds, viewingAs } = await requireOrgStaff();

  let orgName = "";
  if (viewingAs) {
    const supabase = await createClient();
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", orgIds[0])
      .single();
    orgName = org?.name ?? "this organization";
  }

  return (
    <div className="min-h-screen">
      {viewingAs && (
        <div className="print:hidden">
          <ViewAsBanner label={orgName} />
        </div>
      )}
      <nav className="flex flex-wrap items-center gap-5 border-b-2 border-primary-100 bg-white px-6 py-3 text-sm print:hidden">
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
        <TourLauncherButton storageKey="org_v1" />
      </nav>
      <div className="px-6 py-6 print:p-0">{children}</div>
      <div className="print:hidden">
        <Tour storageKey="org_v1" steps={orgTourSteps} />
      </div>
    </div>
  );
}
