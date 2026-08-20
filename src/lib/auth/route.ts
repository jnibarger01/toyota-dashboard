import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./middleware";

/** Server-backed route guard used by the private application shell. */
export const requireAppSession = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(({ context }) => ({ userId: context.userId }));
