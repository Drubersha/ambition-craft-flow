-- Storage API connects as supabase_storage_admin and assumes the caller's role
-- via set_config('role', 'authenticated' | 'service_role' | 'anon', true) before
-- touching storage.objects, so RLS policies are evaluated for the real user.
-- SET ROLE requires membership in the target role; without it the switch fails
-- ("permission denied to set role") and every storage upload is rejected with
-- "new row violates row-level security policy".
GRANT anon, authenticated, service_role TO supabase_storage_admin;
