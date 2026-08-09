-- Keep the earliest copy of each same-day default operation, then prevent future duplicates.
update public.operations
set title = 'Read one chapter'
where title = 'Read 20 pages';

with ranked_operations as (
  select id,
         row_number() over (
           partition by user_id, scheduled_date, title, category
           order by created_at asc, id asc
         ) as row_number
  from public.operations
)
delete from public.operations
where id in (
  select id from ranked_operations where row_number > 1
);

create unique index if not exists operations_one_per_user_day_title_category_idx
  on public.operations (user_id, scheduled_date, title, category);
