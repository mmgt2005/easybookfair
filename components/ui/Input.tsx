import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

// React 19 passes `ref` through as a plain prop for function components
// (no forwardRef needed) — destructuring it here lets callers focus/read
// the underlying <input> directly, e.g. checkout's always-focused scan field.
export function Input({ className, ref, ...props }: ComponentProps<"input">) {
  return (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-xl border-2 border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-100",
        className,
      )}
      {...props}
    />
  );
}
