import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/drivers")({
  beforeLoad: () => {
    throw redirect({ to: "/fleet/drivers" });
  },
});
