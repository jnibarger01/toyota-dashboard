-- MCP (Model Context Protocol) read-only access tokens.
--
-- Deliberately separate from Better Auth's own tables ("user", "account",
-- "session", "verification") — the MCP surface never queries those tables
-- directly. A token here only proves "this bearer represents advisor
-- <user_id> with <scope>"; it is looked up by its SHA-256 hash (the plaintext
-- token is shown once at mint time and never stored). See docs/mcp.md.
create table if not exists mcp_api_tokens (
  id text primary key,
  user_id text not null references "user"(id) on delete cascade,
  label text not null,
  token_hash text not null unique,
  scope text not null default 'toyota:read',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists mcp_api_tokens_user_idx on mcp_api_tokens (user_id);
