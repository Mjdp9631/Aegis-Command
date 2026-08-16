-- AEGIS 085 - repair the generated daily gym rotation
--
-- The daily queue owns one workout/recovery slot per day:
-- Mon Legs, Tue Push, Wed Pull, Thu Rest, Fri Lower Body,
-- Sat Upper Body, Sun Rest.
--
-- Earlier queue builds accepted any existing gym row as that day's slot.
-- Repair only unfinished system-generated split rows; completed history and
-- manually scheduled workouts remain untouched.

-- Remove redundant unfinished generated rows *before* changing their title.
-- Without this order, two older rows on a rest day can both become
-- "Rest - recovery and reset" and violate the per-day unique constraint.
with duplicate_generated_splits as (
  select id
  from (
    select
      id,
      completed,
      row_number() over (
        partition by user_id, coalesce(scheduled_date, operation_date)
        order by
          case
            when coalesce(completed, false) then 0
            when lower(coalesce(status, '')) = 'ongoing' then 1
            else 2
          end,
          created_at desc nulls last,
          id desc
      ) as row_number
    from public.operations
    where is_daily is true
      and coalesce(scheduled_date, operation_date) is not null
      and (
        lower(trim(coalesce(title, ''))) ~ '^gym[[:space:]]*[^[:alnum:][:space:]][[:space:]]*(legs|push|pull|lower body|upper body)[[:space:]]*$'
        or lower(trim(coalesce(title, ''))) ~ '^(recovery|rest)[[:space:]]*[^[:alnum:][:space:]][[:space:]].*(rest|reset)'
      )
  ) ranked
  where row_number > 1
    and coalesce(completed, false) is false
)
delete from public.operations as operation
using duplicate_generated_splits
where operation.id = duplicate_generated_splits.id;

with generated_split_rows as (
  select
    id,
    coalesce(scheduled_date, operation_date) as split_date
  from public.operations
  where is_daily is true
    and coalesce(completed, false) is false
    and coalesce(scheduled_date, operation_date) is not null
    and (
      lower(trim(coalesce(title, ''))) ~ '^gym[[:space:]]*[^[:alnum:][:space:]][[:space:]]*(legs|push|pull|lower body|upper body)[[:space:]]*$'
      or lower(trim(coalesce(title, ''))) ~ '^(recovery|rest)[[:space:]]*[^[:alnum:][:space:]][[:space:]].*(rest|reset)'
    )
)
update public.operations as operation
set
  title = case extract(dow from generated_split_rows.split_date)
    when 0 then 'Rest - recovery and reset'
    when 1 then 'Gym - Legs'
    when 2 then 'Gym - Push'
    when 3 then 'Gym - Pull'
    when 4 then 'Rest - recovery and reset'
    when 5 then 'Gym - Lower Body'
    when 6 then 'Gym - Upper Body'
  end,
  category = case when extract(dow from generated_split_rows.split_date) in (0, 4) then 'Recovery' else 'Self Mastery' end,
  brief = case extract(dow from generated_split_rows.split_date)
    when 0 then 'Protect recovery: light mobility only if it feels good, hydrate, sleep on time, and do not turn rest into a missed plan.'
    when 1 then 'Complete the Legs session selected in Self Mastery. Log every exercise with weight, reps, and sets so AEGIS can evaluate progressive improvement.'
    when 2 then 'Complete the Push session selected in Self Mastery. Log every exercise with weight, reps, and sets so AEGIS can evaluate progressive improvement.'
    when 3 then 'Complete the Pull session selected in Self Mastery. Log every exercise with weight, reps, and sets so AEGIS can evaluate progressive improvement.'
    when 4 then 'Protect recovery: light mobility only if it feels good, hydrate, sleep on time, and do not turn rest into a missed plan.'
    when 5 then 'Complete the Lower Body session selected in Self Mastery. Log every exercise with weight, reps, and sets so AEGIS can evaluate progressive improvement.'
    when 6 then 'Complete the Upper Body session selected in Self Mastery. Log every exercise with weight, reps, and sets so AEGIS can evaluate progressive improvement.'
  end
from generated_split_rows
where operation.id = generated_split_rows.id;
