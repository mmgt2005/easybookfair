"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavLink = { href: string; label: string };
export type NavGroup = { label: string; links: NavLink[] };
export type NavItem = NavLink | NavGroup;

function isGroup(item: NavItem): item is NavGroup {
  return "links" in item;
}

// A group that collapses to a single link (e.g. a role-gated item hidden
// from this viewer) renders as a plain link instead of a one-item dropdown.
function resolveItems(items: NavItem[]): NavItem[] {
  return items.map((item) => (isGroup(item) && item.links.length === 1 ? item.links[0] : item));
}

const linkClass = "font-semibold text-neutral-600 hover:text-accent-600";

export function SiteNav({
  brand,
  versionBadge,
  items,
  trailing,
}: {
  brand: NavLink;
  versionBadge: string;
  items: NavItem[];
  trailing?: ReactNode;
}) {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setOpenGroup(null);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const resolvedItems = resolveItems(items);

  return (
    <nav ref={navRef} className="border-b-2 border-primary-100 bg-white text-sm print:hidden">
      <div className="flex items-center gap-5 px-6 py-3">
        <Link href={brand.href} className="font-heading text-lg font-bold text-primary-600">
          {brand.label}
        </Link>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-500">
          {versionBadge}
        </span>

        <div className="hidden flex-1 items-center gap-5 md:flex">
          {resolvedItems.map((item) =>
            isGroup(item) ? (
              <div key={item.label} className="relative">
                <button
                  type="button"
                  onClick={() => setOpenGroup((g) => (g === item.label ? null : item.label))}
                  className={`flex items-center gap-1 ${linkClass}`}
                  aria-expanded={openGroup === item.label}
                >
                  {item.label} <span aria-hidden>▾</span>
                </button>
                {openGroup === item.label && (
                  <div className="absolute left-0 top-full z-10 mt-2 flex min-w-[11rem] flex-col rounded-xl2 border border-neutral-100 bg-white p-2 shadow-lg">
                    {item.links.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="rounded-lg px-3 py-2 font-semibold text-neutral-600 hover:bg-neutral-50 hover:text-accent-600"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link key={item.href} href={item.href} className={linkClass}>
                {item.label}
              </Link>
            ),
          )}
          <div className="ml-auto">{trailing}</div>
        </div>

        <button
          type="button"
          className="ml-auto flex items-center justify-center rounded-lg p-2 text-neutral-600 hover:bg-neutral-50 md:hidden"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((o) => !o)}
        >
          <span className="sr-only">Toggle menu</span>
          <span aria-hidden className="text-lg leading-none">
            {mobileOpen ? "✕" : "☰"}
          </span>
        </button>
      </div>

      {mobileOpen && (
        <div className="flex flex-col gap-1 border-t border-neutral-100 px-6 py-3 md:hidden">
          {resolvedItems.map((item) =>
            isGroup(item) ? (
              <div key={item.label} className="flex flex-col gap-1 py-1">
                <p className="px-2 text-xs font-bold uppercase tracking-wide text-neutral-400">
                  {item.label}
                </p>
                {item.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-lg px-2 py-2 font-semibold text-neutral-600 hover:bg-neutral-50 hover:text-accent-600"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-2 py-2 font-semibold text-neutral-600 hover:bg-neutral-50 hover:text-accent-600"
              >
                {item.label}
              </Link>
            ),
          )}
          {trailing && <div className="mt-2 border-t border-neutral-100 px-2 pt-2">{trailing}</div>}
        </div>
      )}
    </nav>
  );
}
