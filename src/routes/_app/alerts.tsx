import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/alerts")({
  beforeLoad: () => {
    throw redirect({ to: "/fleet/alerts" });
  },
});
