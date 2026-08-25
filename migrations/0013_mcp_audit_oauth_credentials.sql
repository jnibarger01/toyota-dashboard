-- OAuth access tokens use Better Auth's opaque/jti-derived identifier rather
-- than a row in mcp_api_tokens. Keep the audit credential id useful for both
-- authentication paths instead of silently losing OAuth audit records to the
-- legacy static-token foreign key.
alter table mcp_audit_log drop constraint if exists mcp_audit_log_token_id_fkey;
