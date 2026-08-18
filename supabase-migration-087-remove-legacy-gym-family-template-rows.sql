-- AEGIS 087 - remove obsolete gym-family rows left by migration 086.
--
-- These are not workout records: they were created solely as selectable
-- mission-link templates. Migration 086 correctly stopped their recurrence,
-- but their shared Monday date can still make the planner think five splits
-- happened at once. Completed workout history is never touched.

delete from public.operations
where is_daily is true
  and coalesce(completed, false) is false
  and lower(trim(coalesce(title, ''))) ~ '^gym[[:space:]]*[^[:alnum:][:space:]][[:space:]]*(legs|push|pull|lower body|upper body)[[:space:]]*$'
  and lower(trim(coalesce(brief, ''))) ~ '^complete the (legs|push|pull|lower body|upper body) session selected in self mastery\. log every exercise, weight, reps, and completed sets\.?$';
