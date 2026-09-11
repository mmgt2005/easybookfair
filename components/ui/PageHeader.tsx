import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-heading text-2xl font-bold text-neutral-900">{title}</h1>
        {description && <p className="mt-1 max-w-lg text-sm text-neutral-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3 text-sm">{actions}</div>}
    </div>
  );
}
