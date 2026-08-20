import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { requireAppSession } from "@/lib/auth/route";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    if (import.meta.env.VITE_DEPLOY_TARGET === "pages" || import.meta.env.VITE_AUTH_ENABLED === "false") return;
    try {
      await requireAppSession();
    } catch {
      throw redirect({ to: "/login" });
    }
  },
  component: AppShell,
});
