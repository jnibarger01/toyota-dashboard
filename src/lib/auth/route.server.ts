import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./middleware";

export const requireAppSession = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(({ context }) => ({ userId: context.userId }));
