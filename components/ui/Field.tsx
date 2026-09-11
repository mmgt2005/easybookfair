import type { ReactNode } from "react";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-600">
      {label}
      {children}
      {hint && <span className="text-[11px] font-normal text-neutral-400">{hint}</span>}
    </label>
  );
}
