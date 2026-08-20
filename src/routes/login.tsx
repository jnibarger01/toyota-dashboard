import { createFileRoute, Link } from "@tanstack/react-router";
import { authEnabled, signInWithPassword } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, type FormEvent } from "react";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const message = await signInWithPassword(email.trim(), password);
    if (message) {
      setError("Invalid email or password.");
      setBusy(false);
    } else {
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
          <form className="space-y-3" onSubmit={submit}>
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" autoComplete="username" required />
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" autoComplete="current-password" required />
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
            {error ? <p role="alert" className="text-sm text-accent">{error}</p> : null}
          </form>
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
