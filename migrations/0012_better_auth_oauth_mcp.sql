-- Better Auth 1.7 OAuth 2.1 Provider + MCP resource schema.
-- This migration is additive and preserves existing sessions/accounts.

alter table "account" add column if not exists "issuer" text;
update "account"
set "issuer" = case
  when "providerId" = 'credential' then 'local:credential'
  else 'local:oauth:' || replace("providerId", '/', '%2F')
end
where "issuer" is null;
alter table "account" alter column "issuer" set not null;
create unique index if not exists account_issuer_accountId_uidx on "account" ("issuer", "accountId");

create table if not exists "jwks" (
  "id" text not null primary key,
  "publicKey" text not null,
  "privateKey" text not null,
  "createdAt" timestamptz not null,
  "expiresAt" timestamptz,
  "alg" text,
  "crv" text
);

create table if not exists "oauthClient" (
  "id" text not null primary key,
  "clientId" text not null unique,
  "clientSecret" text,
  "clientDiscoveryId" text,
  "disabled" boolean,
  "skipConsent" boolean,
  "enableEndSession" boolean,
  "subjectType" text,
  "scopes" jsonb,
  "clientCredentialsScopes" jsonb,
  "userId" text references "user" ("id") on delete cascade,
  "createdAt" timestamptz,
  "updatedAt" timestamptz,
  "name" text,
  "uri" text,
  "icon" text,
  "contacts" jsonb,
  "tos" text,
  "policy" text,
  "softwareId" text,
  "softwareVersion" text,
  "softwareStatement" text,
  "redirectUris" jsonb not null,
  "postLogoutRedirectUris" jsonb,
  "backchannelLogoutUri" text,
  "backchannelLogoutSessionRequired" boolean,
  "tokenEndpointAuthMethod" text,
  "applicationType" text,
  "jwks" text,
  "jwksUri" text,
  "grantTypes" jsonb,
  "responseTypes" jsonb,
  "requirePKCE" boolean,
  "dpopBoundAccessTokens" boolean,
  "referenceId" text,
  "metadata" jsonb
);

create table if not exists "oauthResource" (
  "id" text not null primary key,
  "identifier" text not null unique,
  "name" text not null,
  "accessTokenTtl" integer,
  "refreshTokenTtl" integer,
  "signingAlgorithm" text,
  "signingKeyId" text,
  "allowedScopes" jsonb,
  "customClaims" jsonb,
  "dpopBoundAccessTokensRequired" boolean,
  "disabled" boolean,
  "createdAt" timestamptz,
  "updatedAt" timestamptz,
  "policyVersion" integer,
  "metadata" jsonb
);

create table if not exists "oauthClientResource" (
  "id" text not null primary key,
  "clientId" text not null references "oauthClient" ("clientId") on delete cascade,
  "resourceId" text not null references "oauthResource" ("identifier") on delete cascade,
  "metadata" jsonb,
  "createdAt" timestamptz
);

create table if not exists "oauthRefreshToken" (
  "id" text not null primary key,
  "token" text not null unique,
  "clientId" text not null references "oauthClient" ("clientId") on delete cascade,
  "sessionId" text references "session" ("id") on delete set null,
  "userId" text not null references "user" ("id") on delete cascade,
  "referenceId" text,
  "authorizationCodeId" text,
  "resources" jsonb,
  "requestedUserInfoClaims" jsonb,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null,
  "revoked" timestamptz,
  "rotatedAt" timestamptz,
  "rotationReplayResponse" text,
  "rotationReplayExpiresAt" timestamptz,
  "authTime" timestamptz,
  "confirmation" jsonb,
  "scopes" jsonb not null
);

create table if not exists "oauthAccessToken" (
  "id" text not null primary key,
  "token" text not null unique,
  "clientId" text not null references "oauthClient" ("clientId") on delete cascade,
  "sessionId" text references "session" ("id") on delete set null,
  "userId" text references "user" ("id") on delete cascade,
  "referenceId" text,
  "authorizationCodeId" text,
  "resources" jsonb,
  "requestedUserInfoClaims" jsonb,
  "refreshId" text references "oauthRefreshToken" ("id") on delete cascade,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null,
  "revoked" timestamptz,
  "confirmation" jsonb,
  "scopes" jsonb not null
);

create table if not exists "oauthConsent" (
  "id" text not null primary key,
  "clientId" text not null references "oauthClient" ("clientId") on delete cascade,
  "userId" text references "user" ("id") on delete cascade,
  "referenceId" text,
  "resources" jsonb,
  "requestedUserInfoClaims" jsonb,
  "scopes" jsonb not null,
  "createdAt" timestamptz not null,
  "updatedAt" timestamptz not null
);

create table if not exists "oauthClientAssertion" (
  "id" text not null primary key,
  "expiresAt" timestamptz not null
);

create index if not exists oauthClient_userId_idx on "oauthClient" ("userId");
create index if not exists oauthClientResource_clientId_idx on "oauthClientResource" ("clientId");
create index if not exists oauthClientResource_resourceId_idx on "oauthClientResource" ("resourceId");
create index if not exists oauthRefreshToken_clientId_idx on "oauthRefreshToken" ("clientId");
create index if not exists oauthRefreshToken_sessionId_idx on "oauthRefreshToken" ("sessionId");
