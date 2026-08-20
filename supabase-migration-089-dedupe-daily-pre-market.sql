-- AEGIS 089 - one Pre-market analysis path per operating day.
--
-- A prior server rollover could seed the canonical daily row and then clone
-- the prior day's copy when its legacy time/metric differed. Keep one row per
-- user/day (favoring a completed row), then make the daily path race-safe.

with ranked_pre_market as (
  select
    id,
    row_number() over (
      partition by user_id, coalesce(scheduled_date, operation_date)
      order by
        case when coalesce(completed, false) or lower(coalesce(status, '')) = 'complete' then 0 else 1 end,
        created_at desc nulls last,
        id desc
    ) as row_number
  from public.operations
  where is_daily is true
    and lower(trim(coalesce(title, ''))) = 'pre-market analysis'
    and coalesce(scheduled_date, operation_date) is not null
)
delete from public.operations as operation
using ranked_pre_market as ranked
where operation.id = ranked.id
  and ranked.row_number > 1;

create unique index if not exists operations_daily_pre_market_once_per_day
  on public.operations (user_id, (coalesce(scheduled_date, operation_date)))
  where is_daily is true
    and lower(trim(coalesce(title, ''))) = 'pre-market analysis';
