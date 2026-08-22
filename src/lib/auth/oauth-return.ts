/** Preserve the current page/query across an upstream social-login redirect. */
export function currentAuthReturnURL(location: {
  pathname: string;
  search: string;
  hash: string;
}): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

/**
 * Return the Toyota OAuth authorization URL when /login was reached from an
 * authorization request. Better Auth's signed OAuth state remains in its
 * cookie; replaying the original query resumes the pending flow after login.
 */
export function pendingOAuthAuthorizationURL(search: string): string | null {
  const query = new URLSearchParams(search);
  if (!query.get("client_id") || !query.get("redirect_uri")) return null;
  return `/api/auth/oauth2/authorize${search}`;
}
