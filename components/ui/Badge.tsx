import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-neutral-100 text-neutral-700",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
  info: "bg-accent-100 text-accent-700",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}

// Maps the status/type enum strings used across catalog_items, fairs,
// organizations, restock_orders, etc. to a consistent tone, so each page
// doesn't have to hand-pick colors for the same underlying meaning.
const STATUS_TONES: Record<string, Tone> = {
  approved: "success",
  active: "success",
  completed: "success",
  received: "success",
  pending: "warning",
  scheduled: "warning",
  ordered: "warning",
  return_window: "warning",
  declined: "danger",
  cancelled: "danger",
  disputed: "danger",
  closed: "neutral",
  refunded: "neutral",
};

export function statusTone(status: string): Tone {
  return STATUS_TONES[status] ?? "neutral";
}
