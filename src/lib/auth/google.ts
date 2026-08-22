/** Server-only Google social-provider configuration. */
export type GoogleSocialProviderConfig = {
  clientId: string;
  clientSecret: string;
  prompt: "select_account";
};

/**
 * Enable native Better Auth Google sign-in only when both production credentials
 * are present. Credentials are never exported to client code.
 */
export function getGoogleSocialProviderConfig(
  env: Record<string, string | undefined> = process.env,
): GoogleSocialProviderConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, prompt: "select_account" };
}
