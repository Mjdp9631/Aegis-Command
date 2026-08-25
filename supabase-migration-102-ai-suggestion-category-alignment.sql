-- AEGIS 102 — align scheduled AI suggestion categories with the mission system.
-- Run once in Supabase SQL Editor after migration 101.
-- The original 014 table only accepted the legacy category `Mind`, while
-- current scheduled advisories correctly emit `Self Mastery` and `Life Admin`.

alter table public.ai_mission_suggestions
  drop constraint if exists ai_mission_suggestions_category_check;

alter table public.ai_mission_suggestions
  add constraint ai_mission_suggestions_category_check
  check (category in ('Recovery', 'Trading', 'Business', 'Self Mastery', 'Life Admin', 'Mind'));
