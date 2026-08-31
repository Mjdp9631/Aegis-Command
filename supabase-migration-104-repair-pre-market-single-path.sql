-- AEGIS 104 - one canonical Pre-market analysis operation per day.
--
-- Migration 089 protected only rows marked `is_daily`. Some legacy/client
-- races created the same reserved operation without that flag or with a
-- different hyphen character, letting them bypass both that guard and display
-- de-duplication. Keep the best completion record for each user/day, normalize
-- it, and protect the title regardless of the old flag value or punctuation.

with ranked_pre_market as (
  select
    id,
    row_number() over (
      partition by user_id, coalesce(scheduled_date, operation_date)
      order by
        case when coalesce(completed, false) or lower(coalesce(status, '')) in ('complete', 'completed', 'done') then 0 else 1 end,
        created_at asc nulls last,
        id asc
    ) as row_number
  from public.operations
  where lower(regexp_replace(coalesce(title, ''), '[^a-z0-9]+', '', 'g')) = 'premarketanalysis'
    and coalesce(scheduled_date, operation_date) is not null
)
delete from public.operations as operation
using ranked_pre_market as ranked
where operation.id = ranked.id
  and ranked.row_number > 1;

update public.operations
set
  title = 'Pre-market analysis',
  category = 'Trading',
  is_daily = true,
  schedule_mode = 'one_time',
  scheduled_date = coalesce(scheduled_date, operation_date),
  operation_date = coalesce(operation_date, scheduled_date)
where lower(regexp_replace(coalesce(title, ''), '[^a-z0-9]+', '', 'g')) = 'premarketanalysis'
  and coalesce(scheduled_date, operation_date) is not null;

drop index if exists public.operations_daily_pre_market_once_per_day;

create unique index if not exists operations_pre_market_once_per_user_day
  on public.operations (user_id, (coalesce(scheduled_date, operation_date)))
  where lower(regexp_replace(coalesce(title, ''), '[^a-z0-9]+', '', 'g')) = 'premarketanalysis';
