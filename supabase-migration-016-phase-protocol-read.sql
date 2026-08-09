-- AEGIS COMMAND / allow the signed-in director app to read phase gates.
-- Run once in Supabase SQL Editor.

grant select on table public.phase_protocols to authenticated;
