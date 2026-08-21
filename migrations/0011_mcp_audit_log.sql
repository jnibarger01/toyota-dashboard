-- Append-only audit log for MCP-originated mutations (v0.2 write layer).
-- Application code only ever INSERTs into this table — see docs/mcp.md
-- "Audit log" for what "append-only" means here (enforced by code path, not
-- by a DB role/grant; see the same doc's honest note on that limitation).
create table if not exists mcp_audit_log (
  id text primary key,
  occurred_at timestamptz not null default now(),
  user_id text not null references "user"(id) on delete cascade,
  token_id text references mcp_api_tokens(id) on delete set null,
  tool_name text not null,
  request_id text not null,
  entity_type text not null,
  entity_id text not null,
  previous_value jsonb,
  new_value jsonb
);
create index if not exists mcp_audit_log_user_time_idx on mcp_audit_log (user_id, occurred_at desc);
create index if not exists mcp_audit_log_entity_idx on mcp_audit_log (entity_type, entity_id);
create index if not exists mcp_audit_log_token_idx on mcp_audit_log (token_id);
