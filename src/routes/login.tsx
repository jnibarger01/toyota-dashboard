import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6">
      <div className="w-full max-w-sm rounded-xl bg-elevated p-6 shadow-[var(--shadow-border)]">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-ink text-[11px] font-semibold tracking-wide text-elevated">
            SA
          </span>
          <div>
            <h1 className="text-base font-semibold tracking-tight">Command Center</h1>
            <p className="text-xs text-muted">Sign in to sync this lane</p>
          </div>
        </div>
        {authEnabled ? (
          <div className="space-y-2">
            {GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
              >
                Continue with {p.label}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Sign-in is disabled in this environment.</p>
        )}
        <p className="mt-4 text-xs text-muted">
          The lane board still works without an account — the demo stays on this device.
        </p>
        <Link to="/" className="mt-4 inline-block text-sm font-medium underline-offset-4 hover:underline">
          Back to lane board
        </Link>
      </div>
    </main>
  );
}
