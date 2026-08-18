-- AEGIS 086 - retire legacy recurring gym-family templates.
--
-- Gym split families were once saved as daily recurring operations when they
-- were linked to a mission. They are choices for the planner, not a workout
-- on every future date. Convert unfinished system-generated rows to dated
-- one-time records and remove only their unfinished future occurrences.

delete from public.operation_occurrences as occurrence
using public.operations as operation
where occurrence.operation_id = operation.id
  and occurrence.completed is false
  and occurrence.occurrence_date >= current_date
  and operation.is_daily is true
  and coalesce(operation.completed, false) is false
  and coalesce(operation.schedule_mode, 'one_time') in ('daily', 'recurring', 'weekly')
  and (
    lower(trim(coalesce(operation.title, ''))) ~ '^gym[[:space:]]*[^[:alnum:][:space:]][[:space:]]*(legs|push|pull|lower body|upper body)[[:space:]]*$'
    or lower(trim(coalesce(operation.title, ''))) ~ '^(recovery|rest)[[:space:]]*[^[:alnum:][:space:]][[:space:]].*(rest|reset)'
  );

update public.operations
set
  schedule_mode = 'one_time',
  scheduled_end_date = null
where is_daily is true
  and coalesce(completed, false) is false
  and coalesce(schedule_mode, 'one_time') in ('daily', 'recurring', 'weekly')
  and (
    lower(trim(coalesce(title, ''))) ~ '^gym[[:space:]]*[^[:alnum:][:space:]][[:space:]]*(legs|push|pull|lower body|upper body)[[:space:]]*$'
    or lower(trim(coalesce(title, ''))) ~ '^(recovery|rest)[[:space:]]*[^[:alnum:][:space:]][[:space:]].*(rest|reset)'
  );
