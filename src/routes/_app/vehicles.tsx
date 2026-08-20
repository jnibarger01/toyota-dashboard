import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/vehicles")({
  beforeLoad: () => {
    throw redirect({ to: "/fleet/vehicles" });
  },
});
