import { createFileRoute, Link } from "@tanstack/react-router";
import { authClient, authEnabled, signInWithPassword } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pendingOAuthAuthorizationURL, currentAuthReturnURL } from "@/lib/auth/oauth-return";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useEffect, useMemo, useState, type FormEvent } from "react";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { user, isPending } = useCurrentUserState();
  const pendingAuthorizationURL = useMemo(
    () => (typeof window === "undefined" ? null : pendingOAuthAuthorizationURL(window.location.search)),
    [],
  );

  // After Google returns to /login, replay the original Toyota authorization
  // request so Better Auth can render /consent instead of landing on the home page.
  useEffect(() => {
    if (!pendingAuthorizationURL || isPending || !user) return;
    window.location.replace(pendingAuthorizationURL);
  }, [isPending, pendingAuthorizationURL, user]);

  function authReturnURL(): string {
    if (typeof window === "undefined") return "/";
    return currentAuthReturnURL(window.location);
  }

  async function signInWithGoogle(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL: authReturnURL(),
    });
    if (result.error) {
      setError(result.error.message ?? "Google sign-in failed");
      setBusy(false);
      return;
    }
    if (result.data?.url) window.location.assign(result.data.url);
    else {
      setError("Google sign-in did not return a redirect");
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const message = await signInWithPassword(email.trim(), password, authReturnURL());
    if (message) {
      setError("Invalid email or password.");
      setBusy(false);
    } else if (!pendingAuthorizationURL) {
      window.location.href = "/";
    }
  }

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
          <div className="space-y-4">
            <Button type="button" className="w-full" disabled={busy} onClick={() => void signInWithGoogle()}>
              {busy ? "Connecting…" : "Continue with Google"}
            </Button>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-border" />
              <span>or use email</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <form className="space-y-3" onSubmit={submit}>
              <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" autoComplete="username" required />
              <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" autoComplete="current-password" required />
              <Button type="submit" variant="outline" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in with email"}</Button>
            </form>
            {error ? <p role="alert" className="text-sm text-accent">{error}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-muted">Sign-in is disabled in this environment.</p>
        )}
        <p className="mt-4 text-xs text-muted">
          The public demo is fictional and separate from the private production lane.
        </p>
        <Link to="/" className="mt-4 inline-block text-sm font-medium underline-offset-4 hover:underline">
          Back to lane board
        </Link>
      </div>
    </main>
  );
}
