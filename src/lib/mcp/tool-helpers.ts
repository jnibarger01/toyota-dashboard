import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Reads the advisor id `server.ts` attached to the transport's `authInfo` for
 * this connection. Throws (never queries with an unresolved user) if a tool
 * is somehow invoked without it — should be unreachable since `auth.ts`
 * verifies the token before the server/transport are even constructed.
 */
type ToolContext = { authInfo?: { scopes?: string[]; extra?: Record<string, unknown> }; http?: { authInfo?: { scopes?: string[]; extra?: Record<string, unknown> } } };

function authInfo(extra: unknown): ToolContext["authInfo"] {
  const context = (extra ?? {}) as ToolContext;
  return context.authInfo ?? context.http?.authInfo;
}

export function requireUserId(extra: unknown): string {
  const userId = authInfo(extra)?.extra?.userId;
  if (typeof userId !== "string" || !userId) {
    throw new Error("MCP tool invoked without a resolved user context");
  }
  return userId;
}

/** Successful tool result: JSON-serialized data as the single text block. */
export function textResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/** Tool-level failure (e.g. "not found") — the call succeeded, the operation didn't. */
export function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Wraps a tool handler so any unexpected exception (DB connectivity, driver
 * errors, etc.) becomes a generic, non-leaking `isError` result instead of a
 * raw stack trace or SQL/connection detail reaching the client. Full detail
 * still goes to server logs.
 */
export async function safeToolCall(name: string, fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[mcp] tool "${name}" failed`, err);
    return errorResult("Internal error — the request could not be completed.");
  }
}

/** Clamps a caller-supplied limit into [1, max], defaulting when omitted. */
export function clampLimit(value: number | undefined, def: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return def;
  return Math.min(max, Math.max(1, Math.trunc(value)));
}

/**
 * The `tokenId`/`requestId` a write tool needs for its audit entry — set by
 * `src/routes/api/mcp.ts` alongside `userId`. Throws under the same
 * "should be unreachable" reasoning as `requireUserId`.
 */
export function requireWriteContext(extra: unknown): { userId: string; tokenId: string; requestId: string } {
  const userId = requireUserId(extra);
  const tokenId = authInfo(extra)?.extra?.tokenId;
  const requestId = authInfo(extra)?.extra?.requestId;
  if (typeof tokenId !== "string" || !tokenId) throw new Error("MCP tool invoked without a resolved token id");
  if (typeof requestId !== "string" || !requestId) throw new Error("MCP tool invoked without a request id");
  return { userId, tokenId, requestId };
}

/**
 * Per-tool scope gate, called BEFORE `safeToolCall` so a missing scope
 * returns a specific, clear message rather than being swallowed by the
 * generic-error catch-all. Scope checking lives here (call time, per tool),
 * not in `auth.ts` (connection time) — different tools need different
 * scopes, and a token may legitimately hold only some of them.
 */
export function checkScope(extra: unknown, required: string): CallToolResult | null {
  const scopes = authInfo(extra)?.scopes ?? [];
  if (scopes.includes(required)) return null;
  return errorResult(`Missing required scope: ${required}`);
}

/**
 * Maps a caught error to a clean tool-level result ONLY if its message
 * exactly matches (or, for a RegExp entry, matches) one of the caller's
 * known-safe, hand-authored domain messages (e.g. "Repair order not found").
 * Anything else — a driver/connection error, something unanticipated — is
 * RE-THROWN so the enclosing `safeToolCall` turns it into the generic,
 * non-leaking message and logs the real detail server-side. Never widen
 * `knownMessages` to a pattern that could match a database/driver error.
 */
export function domainErrorResult(err: unknown, knownMessages: (string | RegExp)[]): CallToolResult {
  if (err instanceof Error) {
    const message = err.message;
    const matches = knownMessages.some((known) => (typeof known === "string" ? message === known : known.test(message)));
    if (matches) return errorResult(message);
  }
  throw err;
}
