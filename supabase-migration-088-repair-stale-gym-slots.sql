-- AEGIS 088 - remove stale duplicate gym/recovery slots from the legacy
-- weekday generator.
--
-- Migration 085 could rewrite an old recurring gym-family template's brief
-- before 087 identified it.  Those rows are no longer recurring after 086,
-- but can remain as a second dated slot (for example, both Rest and Lower
-- Body on a Tuesday).  Keep one unfinished generated slot per user/day; the
-- current planner then assigns its correct movable weekly split on load.
-- Completed history, past records, and manually-created workouts are not
-- touched.

with ranked_generated_slots as (
  select
    id,
    row_number() over (
      partition by user_id, coalesce(scheduled_date, operation_date)
      order by
        case when lower(trim(coalesce(title, ''))) = 'gym - push' then 0 else 1 end,
        created_at asc nulls last,
        id asc
    ) as row_number
  from public.operations
  where is_daily is true
    and coalesce(completed, false) is false
    and coalesce(scheduled_date, operation_date) is not null
    and coalesce(scheduled_date, operation_date) >= current_date
    and (
      (
        lower(trim(coalesce(title, ''))) ~ '^gym[[:space:]]*[^[:alnum:][:space:]][[:space:]]*(legs|push|pull|lower body|upper body)[[:space:]]*$'
        and lower(coalesce(brief, '')) like 'complete the % session selected in self mastery.%'
      )
      or (
        lower(trim(coalesce(title, ''))) ~ '^(recovery|rest)[[:space:]]*[^[:alnum:][:space:]][[:space:]].*(rest|reset)'
        and lower(coalesce(brief, '')) like '%protect recovery: light mobility only%'
      )
    )
)
delete from public.operations as operation
using ranked_generated_slots as ranked
where operation.id = ranked.id
  and ranked.row_number > 1;
