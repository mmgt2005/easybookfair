import Link from "next/link";
import { requireAuthor } from "@/lib/auth";
import { Tour, TourLauncherButton } from "@/components/Tour";
import packageJson from "@/package.json";

const navLinks = [
  { href: "/author", label: "Dashboard" },
  { href: "/author/submit", label: "Submit new item" },
];

const authorTourSteps = [
  {
    title: "Welcome to your author portal 👋",
    description: "Track the status of everything you've submitted, and how it's selling.",
  },
  {
    title: "Dashboard",
    description:
      "See each submission's review status, and — once approved and on sale — units sold and revenue.",
  },
  {
    title: "Submit new item",
    description: "Already have an account, so this pre-fills your name and email for you.",
  },
];

export default async function AuthorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAuthor();

  return (
    <div className="min-h-screen">
      <nav className="flex flex-wrap items-center gap-5 border-b-2 border-primary-100 bg-white px-6 py-3 text-sm">
        <Link href="/author" className="font-heading text-lg font-bold text-primary-600">
          📚 EasyBookFair — Author Portal
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
        <TourLauncherButton storageKey="author_v1" />
      </nav>
      <div className="px-6 py-6">{children}</div>
      <Tour storageKey="author_v1" steps={authorTourSteps} />
    </div>
  );
}
