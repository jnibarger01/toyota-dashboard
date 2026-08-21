import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { authClient } from "@/lib/auth/client";

export const Route = createFileRoute("/consent")({ component: OAuthConsent });

function OAuthConsent() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useMemo(() => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search), []);
  const clientId = query.get("client_id") ?? "the MCP client";
  const requestedScopes = query.get("scope") ?? "toyota:read";
  const requestedClaims = (() => {
    const raw = query.get("claims");
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  })();

  async function decide(accept: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await authClient.oauth2.consent({
      accept,
      scope: accept ? requestedScopes : undefined,
      claims: accept ? requestedClaims : undefined,
    });
    if (result.error) {
      setError(result.error.message ?? "OAuth consent failed");
      setBusy(false);
      return;
    }
    const redirect = result.data && "redirect_uri" in result.data ? result.data.redirect_uri : "url" in (result.data ?? {}) ? result.data.url : undefined;
    if (redirect) window.location.assign(String(redirect));
    else setError("OAuth provider did not return a redirect");
    setBusy(false);
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 py-10 text-fg">
      <section className="w-full max-w-md rounded-2xl bg-elevated p-6 shadow-[var(--shadow-border)]">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Toyota Dashboard</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Authorize MCP access</h1>
        <p className="mt-2 text-sm text-muted">{clientId} is requesting access to your service lane.</p>
        <div className="mt-5 rounded-lg bg-bg p-3 text-sm">
          <div className="font-medium">Requested scopes</div>
          <div className="mt-1 break-words text-muted">{requestedScopes}</div>
        </div>
        {error ? <p className="mt-4 text-sm text-accent">{error}</p> : null}
        <div className="mt-6 flex gap-3">
          <button type="button" disabled={busy} onClick={() => void decide(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">
            Deny
          </button>
          <button type="button" disabled={busy} onClick={() => void decide(true)} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg">
            {busy ? "Authorizing…" : "Allow access"}
          </button>
        </div>
      </section>
    </main>
  );
}
