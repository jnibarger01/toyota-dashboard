import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/maintenance")({
  beforeLoad: () => {
    throw redirect({ to: "/fleet/maintenance" });
  },
});
