-- AEGIS COMMAND / AI table API permissions
-- Run once after migration 014.

grant select, insert, update, delete on table public.ai_advisories to authenticated;
grant select, insert, update, delete on table public.ai_mission_suggestions to authenticated;

-- Server-side scheduled scans use the private Supabase secret key.
grant all privileges on table public.ai_advisories to service_role;
grant all privileges on table public.ai_mission_suggestions to service_role;
