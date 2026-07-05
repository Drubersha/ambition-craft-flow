-- Required Supabase roles for GoTrue, PostgREST and Storage
-- Runs only on first init of an empty Postgres volume

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    EXECUTE format('CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD %L', current_setting('POSTGRES_PASSWORD', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE format('CREATE ROLE supabase_auth_admin LOGIN CREATEROLE PASSWORD %L', current_setting('POSTGRES_PASSWORD', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
    EXECUTE format('CREATE ROLE supabase_storage_admin LOGIN CREATEROLE PASSWORD %L', current_setting('POSTGRES_PASSWORD', true));
  END IF;
END
$$;

GRANT anon, authenticated, service_role TO authenticator;
-- Storage API assumes the caller's role (set_config('role', ...)) to evaluate
-- RLS on storage.objects; without these memberships every upload fails with
-- "new row violates row-level security policy".
GRANT anon, authenticated, service_role TO supabase_storage_admin;
GRANT ALL ON SCHEMA public TO postgres, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Schemas used by Auth and Storage
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
CREATE SCHEMA IF NOT EXISTS storage AUTHORIZATION supabase_storage_admin;