import { createFileRoute } from "@tanstack/react-router";
import { auth, jaceOAuth } from "@/lib/auth/server";
import { resolveJaceEndSessionUrl } from "@/lib/auth/jace-logout.server";

const JACE_LOGOUT_PATH = "/api/auth/jace-logout";

async function handleJaceLogoutLookup(request: Request): Promise<Response> {
  if (!jaceOAuth) {
    return Response.json({ endSessionUrl: null });
  }
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id ?? null;
  if (!userId) {
    return Response.json({ endSessionUrl: null });
  }

  let redirectTo: unknown = "/";
  try {
    const body = (await request.json()) as { redirectTo?: unknown } | null;
    if (body && typeof body === "object") redirectTo = body.redirectTo;
  } catch {
    // Empty or non-JSON body defaults to "/".
  }

  const sql = await (await import("@/lib/db")).getSql();
  const origin = new URL(request.url).origin;
  const endSessionUrl = await resolveJaceEndSessionUrl({
    jaceConfig: jaceOAuth,
    userId,
    origin,
    redirectTo,
    sql,
  });
  return Response.json({ endSessionUrl });
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => {
        if (new URL(request.url).pathname === JACE_LOGOUT_PATH) {
          return handleJaceLogoutLookup(request);
        }
        return auth.handler(request);
      },
    },
  },
});
