import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/fuel")({
  beforeLoad: () => {
    throw redirect({ to: "/fleet/fuel" });
  },
});
