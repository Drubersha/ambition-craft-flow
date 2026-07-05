-- Storage API runs its queries after switching to the caller's role
-- (anon / authenticated / service_role). Unqualified names like "buckets"
-- resolve through search_path, and Postgres silently skips schemas the
-- current role has no USAGE on — so without these grants every storage
-- request fails with: relation "buckets" does not exist.
--
-- Fresh installs get these grants from the supabase/postgres image init
-- scripts; this migration repairs databases initialised without them.
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA storage TO anon, authenticated, service_role;

-- Tables created later by storage-api migrations (they run as
-- supabase_storage_admin) must get the same grants automatically.
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_storage_admin IN SCHEMA storage
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_storage_admin IN SCHEMA storage
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
