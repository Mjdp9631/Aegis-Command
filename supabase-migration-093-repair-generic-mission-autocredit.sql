-- AEGIS 093 — stop generic historical completions from inflating a new mission.
-- Run once in the Supabase SQL Editor after migration 092.
--
-- The app now requires an explicit operation-family link before the generic
-- operation.complete key can advance a mission. This corrects the one mission
-- that was created with a requested 0/10 count but immediately inherited two
-- old generic completions.

update public.missions
set
  completed_count = 0,
  completed = false,
  progress = 0,
  metric_key = null,
  manual_progress_override = true
where user_id = auth.uid()
  and lower(trim(title)) = lower('Read "Millionaire Success Habits"')
  and lower(coalesce(completion_type, '')) = 'units'
  and coalesce(target_count, 0) = 10;
