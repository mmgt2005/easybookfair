import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-xl border-2 border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-100",
        className,
      )}
      {...props}
    />
  );
}
