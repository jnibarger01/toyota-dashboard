import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium leading-none tracking-wide",
  {
    variants: {
      tone: {
        neutral: "bg-ink/8 text-ink",
        accent: "bg-accent-soft text-accent",
        warn: "bg-warn-soft text-warn",
        ok: "bg-ok-soft text-ok",
        info: "bg-info-soft text-info",
        danger: "bg-danger-soft text-danger",
        outline: "border border-border text-muted",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
