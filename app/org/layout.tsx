import Link from "next/link";
import { requireOrgStaff } from "@/lib/auth";
import { Tour, TourLauncherButton } from "@/components/Tour";
import packageJson from "@/package.json";

const navLinks = [
  { href: "/org", label: "Dashboard" },
  { href: "/org/fairs/request", label: "Request a fair" },
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
        <TourLauncherButton storageKey="org_v1" />
      </nav>
      <div className="px-6 py-6">{children}</div>
      <Tour storageKey="org_v1" steps={orgTourSteps} />
    </div>
  );
}
