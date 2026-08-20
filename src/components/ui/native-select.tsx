import { type SelectHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "h-8 rounded-md border border-border bg-elevated px-2 text-xs text-ink",
        "focus-visible:border-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/15",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
NativeSelect.displayName = "NativeSelect";
