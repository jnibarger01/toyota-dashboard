import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Panel({
  title,
  action,
  children,
  className,
  padded = true,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={cn("overflow-hidden rounded-xl bg-elevated shadow-[var(--shadow-border)]", className)}
    >
      {title ? (
        <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
          <h2 className="text-sm font-medium tracking-tight">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className={cn(padded ? "px-4 pb-4" : "", title && padded ? "pt-1" : "")}>{children}</div>
    </section>
  );
}
