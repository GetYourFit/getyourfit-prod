-- Better Auth tables, generated with `getMigrations(auth.options).compileMigrations()` for the options in
-- server/auth.mjs and pinned here so the schema is reviewed and versioned like the rest of the data layer.
create table "user" (
  "id" text not null primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" boolean not null,
  "image" text,
  "createdAt" timestamptz default CURRENT_TIMESTAMP not null,
  "updatedAt" timestamptz default CURRENT_TIMESTAMP not null,
  "twoFactorEnabled" boolean,
  "adultConfirmed" boolean not null
);
create table "session" (
  "id" text not null primary key,
  "expiresAt" timestamptz not null,
  "token" text not null unique,
  "createdAt" timestamptz default CURRENT_TIMESTAMP not null,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user" ("id") on delete cascade
);
create table "account" (
  "id" text not null primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz default CURRENT_TIMESTAMP not null,
  "updatedAt" timestamptz not null
);
create table "verification" (
  "id" text not null primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz default CURRENT_TIMESTAMP not null,
  "updatedAt" timestamptz default CURRENT_TIMESTAMP not null
);
create table "twoFactor" (
  "id" text not null primary key,
  "secret" text not null,
  "backupCodes" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "verified" boolean,
  "failedVerificationCount" integer,
  "lockedUntil" timestamptz
);
create table "rateLimit" (
  "id" text not null primary key,
  "key" text not null unique,
  "count" integer not null,
  "lastRequest" bigint not null
);
create index "session_userId_idx" on "session" ("userId");
create index "account_userId_idx" on "account" ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");
create index "twoFactor_secret_idx" on "twoFactor" ("secret");
create index "twoFactor_userId_idx" on "twoFactor" ("userId");

create table auth_audit (
  id text primary key,
  action text not null,
  occurred_at timestamptz not null
);
create table auth_lockouts (
  email_hash text primary key,
  failures integer not null,
  window_started bigint not null,
  locked_until bigint not null default 0
);

create table garments (
  id text primary key,
  user_id text not null references "user" (id) on delete cascade,
  facts jsonb not null,
  provenance jsonb not null,
  interpretation jsonb not null,
  photo bytea not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create index garments_owner on garments (user_id);
create table outfit_exclusions (
  user_id text not null references "user" (id) on delete cascade,
  garment_id text not null references garments (id) on delete cascade,
  context text not null,
  recorded_at timestamptz not null,
  primary key (user_id, garment_id, context)
);
create table starter_plans (
  id text primary key,
  user_id text not null references "user" (id) on delete cascade,
  status text not null check (status in ('active', 'replaced', 'rejected')),
  input jsonb not null,
  roles jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create index starter_plans_owner on starter_plans (user_id, created_at desc);
