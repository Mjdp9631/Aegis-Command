-- Link each concrete operation to the mission it advances.
alter table public.operations
  add column if not exists mission_id uuid references public.missions(id) on delete set null;

create index if not exists operations_user_mission_idx
  on public.operations (user_id, mission_id);

-- Give existing operations a sensible starting link when one active mission
-- exists in the same department. New operations are selected explicitly.
with ranked_missions as (
  select id, user_id, category,
    row_number() over (partition by user_id, category order by created_at asc) as row_num
  from public.missions
  where coalesce(completed, false) = false
)
update public.operations operation
set mission_id = mission.id
from ranked_missions mission
where operation.user_id = mission.user_id
  and operation.category = mission.category
  and mission.row_num = 1
  and operation.mission_id is null;
