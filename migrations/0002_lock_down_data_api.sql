-- Supabase exposes every table in the public schema through its Data API to the `anon` and `authenticated` roles.
-- The app reaches Postgres only through its own server connection, so deny those roles everything: row level
-- security on every table (no policies means no rows) plus no grants. On plain Postgres the roles do not exist.
alter table "user" enable row level security;
alter table "session" enable row level security;
alter table "account" enable row level security;
alter table "verification" enable row level security;
alter table "twoFactor" enable row level security;
alter table "rateLimit" enable row level security;
alter table auth_audit enable row level security;
alter table auth_lockouts enable row level security;
alter table garments enable row level security;
alter table outfit_exclusions enable row level security;
alter table starter_plans enable row level security;
alter table schema_migrations enable row level security;

do $$
declare role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on all tables in schema public from %I', role_name);
      execute format('revoke all on all sequences in schema public from %I', role_name);
      execute format('revoke all on all functions in schema public from %I', role_name);
      execute format('alter default privileges in schema public revoke all on tables from %I', role_name);
      execute format('alter default privileges in schema public revoke all on sequences from %I', role_name);
      execute format('alter default privileges in schema public revoke all on functions from %I', role_name);
    end if;
  end loop;
end $$;
