import { type TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      suppressHydrationWarning
      className={cn(
        "flex min-h-24 w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-ink placeholder:text-subtle",
        "transition-[box-shadow,border-color] duration-150",
        "focus-visible:border-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/15",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
