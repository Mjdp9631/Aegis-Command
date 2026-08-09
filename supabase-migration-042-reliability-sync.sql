-- AEGIS 042 — reliability pass for shared operation, mission, and activity data.
-- Run once after migrations 040 and 041.  It deliberately does not reset XP,
-- rewrite historical activity, or backfill campaign rewards.

-- Normalize the older UI label so recurring operations persist under the
-- database's existing one_time / recurring constraint.
update public.operations
set schedule_mode = 'recurring'
where schedule_mode = 'weekly';

-- A mission may use the human-friendly metric used in its creation form while
-- its underlying log emits a more specific event key.  Keep this mapping in
-- one place so gym, books, PT, nutrition, quotes, trades, and future logs all
-- follow the same route.
create or replace function public.aegis_metric_matches(p_mission text, p_event text)
returns boolean language sql immutable as $$
  select lower(coalesce(p_mission, '')) = lower(coalesce(p_event, ''))
    or (lower(coalesce(p_mission, '')) = 'chapters_read' and lower(coalesce(p_event, '')) in ('mastery.book', 'mind.book'))
    or (lower(coalesce(p_mission, '')) = 'pt_session' and lower(coalesce(p_event, '')) in ('recovery.report', 'recovery.pt_session'))
    or (lower(coalesce(p_mission, '')) = 'gym_session' and lower(coalesce(p_event, '')) in ('body.gym', 'mastery.gym'))
    or (lower(coalesce(p_mission, '')) = 'nutrition_log' and lower(coalesce(p_event, '')) = 'health.nutrition')
    or (lower(coalesce(p_mission, '')) = 'weight_log' and lower(coalesce(p_event, '')) = 'health.weight')
    or (lower(coalesce(p_mission, '')) = 'trade_review' and lower(coalesce(p_event, '')) in ('trading.trade', 'trading.review'))
    or (lower(coalesce(p_mission, '')) = 'mind_entry' and lower(coalesce(p_event, '')) like 'mastery.%')
$$;

create or replace function public.aegis_increment_mission(
  p_user uuid,
  p_metric text,
  p_activity uuid,
  p_amount integer default 1
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_mission uuid;
  v_event uuid;
  v_amount integer := greatest(1, coalesce(p_amount, 1));
begin
  if p_metric is null then return; end if;
  select id into v_mission
  from public.missions
  where user_id = p_user
    and completed is false
    and public.aegis_metric_matches(metric_key, p_metric)
  order by created_at asc
  limit 1;
  if v_mission is null then return; end if;

  insert into public.mission_progress_events(user_id, mission_id, activity_event_id, amount)
  values (p_user, v_mission, p_activity, v_amount)
  on conflict do nothing
  returning id into v_event;

  -- Only increment when this activity was actually inserted.  The old trigger
  -- incremented again on a duplicate event, which is why counters drifted.
  if v_event is not null then
    update public.missions
    set completed_count = least(coalesce(target_count, 1), coalesce(completed_count, 0) + v_amount),
        completed = coalesce(completed_count, 0) + v_amount >= coalesce(target_count, 1)
    where id = v_mission and user_id = p_user;
  end if;
end $$;

create or replace function public.aegis_sync_operation_progress()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mission uuid;
  v_event uuid;
  v_amount integer := greatest(1, coalesce(new.mission_increment, 1));
begin
  if new.completed is true and coalesce(old.completed, false) is false then
    v_mission := new.mission_id;
    if v_mission is null and new.metric_key is not null then
      select id into v_mission from public.missions
      where user_id = new.user_id
        and completed is false
        and public.aegis_metric_matches(metric_key, new.metric_key)
      order by created_at asc limit 1;
    end if;
    if v_mission is not null then
      insert into public.mission_progress_events(user_id, mission_id, operation_id, amount)
      values (new.user_id, v_mission, new.id, v_amount)
      on conflict do nothing
      returning id into v_event;
      if v_event is not null then
        update public.missions
          set completed_count = least(coalesce(target_count, 1), coalesce(completed_count, 0) + v_amount),
              completed = coalesce(completed_count, 0) + v_amount >= coalesce(target_count, 1)
          where id = v_mission and user_id = new.user_id;
      end if;
      new.mission_id := v_mission;
      new.mission_incremented := true;
    end if;
    insert into public.activity_events(user_id, source_type, source_id, metric_key, occurred_at, metadata)
    values (new.user_id, 'operations', new.id, coalesce(new.metric_key, 'operation.complete'), now(), jsonb_build_object('title', new.title, 'category', new.category))
    on conflict (source_type, source_id) do nothing;
  elsif new.completed is false and coalesce(old.completed, false) is true then
    select mission_id into v_mission from public.mission_progress_events where operation_id = new.id;
    if v_mission is not null then
      delete from public.mission_progress_events where operation_id = new.id;
      update public.missions set completed_count = greatest(0, coalesce(completed_count, 0) - v_amount), completed = false where id = v_mission;
    end if;
    delete from public.activity_events where source_type = 'operations' and source_id = new.id;
    new.mission_incremented := false;
  end if;
  return new;
end $$;

-- The current logged-in user can read all new support rows used by the UI.
grant execute on function public.aegis_metric_matches(text, text) to authenticated;
grant execute on function public.aegis_increment_mission(uuid, text, uuid, integer) to authenticated;
