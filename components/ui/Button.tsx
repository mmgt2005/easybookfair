import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "outline" | "ghost";
type Size = "sm" | "md";

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-heading font-semibold transition-transform active:scale-95 disabled:pointer-events-none disabled:opacity-50",
        size === "md" ? "px-4 py-2 text-sm" : "px-3 py-1 text-xs",
        variant === "primary" &&
          "bg-primary-500 text-white shadow-sm hover:bg-primary-600",
        variant === "secondary" &&
          "bg-accent-500 text-white shadow-sm hover:bg-accent-600",
        variant === "outline" &&
          "border-2 border-neutral-200 text-neutral-700 hover:border-primary-400 hover:text-primary-600",
        variant === "ghost" && "text-accent-600 hover:bg-accent-50",
        className,
      )}
      {...props}
    />
  );
}
