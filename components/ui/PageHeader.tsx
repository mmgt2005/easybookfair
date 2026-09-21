import type { ReactNode } from "react";
import Link from "next/link";

export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel = "Back",
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        {backHref && (
          <Link
            href={backHref}
            className="mb-1 inline-block text-sm font-semibold text-accent-600 hover:underline"
          >
            ← {backLabel}
          </Link>
        )}
        <h1 className="font-heading text-2xl font-bold text-neutral-900">{title}</h1>
        {description && <p className="mt-1 max-w-lg text-sm text-neutral-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3 text-sm">{actions}</div>}
    </div>
  );
}
