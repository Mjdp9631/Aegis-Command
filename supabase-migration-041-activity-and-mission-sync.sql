-- AEGIS 041 — one evidence path for every logged activity and measured mission.
-- Run once after 040.  It does not touch historical XP or backfill anything.

-- A measurable mission may be advanced by an operation OR by a direct activity
-- such as a gym session, a mastery entry, a recovery report, or a trade log.
alter table public.mission_progress_events
  add column if not exists activity_event_id uuid references public.activity_events(id) on delete cascade;
create unique index if not exists mission_progress_activity_unique
  on public.mission_progress_events(activity_event_id) where activity_event_id is not null;

create or replace function public.aegis_increment_mission(
  p_user uuid,
  p_metric text,
  p_activity uuid,
  p_amount integer default 1
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_mission uuid;
begin
  if p_metric is null then return; end if;
  select id into v_mission
  from public.missions
  where user_id = p_user
    and completed is false
    and metric_key = p_metric
  order by created_at asc
  limit 1;
  if v_mission is null then return; end if;
  insert into public.mission_progress_events(user_id, mission_id, activity_event_id, amount)
  values (p_user, v_mission, p_activity, greatest(1, p_amount))
  on conflict (activity_event_id) do nothing;
  if found then
    update public.missions
    set completed_count = least(coalesce(target_count, 1), coalesce(completed_count, 0) + greatest(1, p_amount)),
        completed = coalesce(completed_count, 0) + greatest(1, p_amount) >= coalesce(target_count, 1)
    where id = v_mission and user_id = p_user;
  end if;
end $$;

create or replace function public.aegis_progress_from_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Operation completions already receive their progress in aegis_sync_operation_progress.
  if new.source_type <> 'operations' then
    perform public.aegis_increment_mission(new.user_id, new.metric_key, new.id, 1);
  end if;
  return new;
end $$;

drop trigger if exists aegis_activity_mission_progress on public.activity_events;
create trigger aegis_activity_mission_progress
  after insert on public.activity_events
  for each row execute function public.aegis_progress_from_activity();

-- Persist the actual date used for an operation so Character’s discipline
-- ledger and the 5am rollover read the same day as the queue and calendar.
update public.operations
set operation_date = coalesce(operation_date, scheduled_date, current_date)
where operation_date is null;

grant execute on function public.aegis_increment_mission(uuid, text, uuid, integer) to authenticated;
