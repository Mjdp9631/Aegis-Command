-- AEGIS COMMAND / roadmap client access
-- Run once after migration 017.

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.ai_roadmap_missions to authenticated;
grant select, insert, update, delete on table public.ai_mission_suggestions to authenticated;
