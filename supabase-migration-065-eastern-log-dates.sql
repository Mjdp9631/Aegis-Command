-- AEGIS 065 — use Eastern calendar dates for manually logged evidence.
-- Run once in the Supabase SQL Editor.

-- Supabase's current_date follows the database session timezone (normally
-- UTC). These logs are entered by the director in Eastern time, so defaults
-- must follow the product's displayed calendar.
alter table public.training_sessions
  alter column logged_on set default ((now() at time zone 'America/New_York')::date);

alter table public.training_sets
  alter column logged_on set default ((now() at time zone 'America/New_York')::date);

alter table public.health_weight_logs
  alter column logged_on set default ((now() at time zone 'America/New_York')::date);

alter table public.health_food_logs
  alter column logged_on set default ((now() at time zone 'America/New_York')::date);

alter table public.capability_skill_logs
  alter column practiced_on set default ((now() at time zone 'America/New_York')::date);

-- Repair the specific legacy pattern created after 8 PM Eastern: the stored
-- date is exactly one day after the Eastern date represented by created_at.
update public.training_sessions
set logged_on = (created_at at time zone 'America/New_York')::date
where logged_on = ((created_at at time zone 'America/New_York')::date + 1);

update public.health_weight_logs
set logged_on = (created_at at time zone 'America/New_York')::date
where logged_on = ((created_at at time zone 'America/New_York')::date + 1);

update public.health_food_logs
set logged_on = (created_at at time zone 'America/New_York')::date
where logged_on = ((created_at at time zone 'America/New_York')::date + 1);

update public.capability_skill_logs
set practiced_on = (created_at at time zone 'America/New_York')::date
where practiced_on = ((created_at at time zone 'America/New_York')::date + 1);

-- Training sets belong to their parent session and should always share its
-- evidence date, including rows repaired above.
update public.training_sets as sets
set logged_on = sessions.logged_on
from public.training_sessions as sessions
where sets.session_id = sessions.id
  and sets.logged_on is distinct from sessions.logged_on;
