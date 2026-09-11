import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";

const shortcuts = [
  {
    href: "/admin/catalog",
    emoji: "📖",
    label: "Catalog",
    description: "Add items, bulk upload, restock, edit",
  },
  {
    href: "/admin/organizations",
    emoji: "🏫",
    label: "Organizations",
    description: "Minimal scaffolding to create a test org (real review + Stripe onboarding is Phase 3)",
  },
  {
    href: "/admin/fairs",
    emoji: "🎪",
    label: "Fairs",
    description: "Create a fair, then allocate inventory to it",
  },
  {
    href: "/admin/carton-specs",
    emoji: "📦",
    label: "Carton specs",
    description: "Box sizes used by the packing suggestion",
  },
];

export default function AdminHome() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Admin"
        description="The real admin dashboard (active fairs, revenue/wholesale-owed totals, pending applications) is a later phase. For now, jump into a section below."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {shortcuts.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="flex h-full flex-col gap-1 transition-shadow hover:shadow-md">
              <span className="text-2xl">{s.emoji}</span>
              <span className="font-heading text-lg font-bold text-neutral-900">{s.label}</span>
              <span className="text-sm text-neutral-600">{s.description}</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
