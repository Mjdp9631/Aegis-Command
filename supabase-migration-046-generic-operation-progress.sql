-- AEGIS 046 — one durable progress path for operations and recurring instances.
-- Run after migrations 040–045.  It is idempotent and repairs completed rows
-- that existed before the occurrence trigger was installed.

alter table public.mission_progress_events
  add column if not exists occurrence_id uuid references public.operation_occurrences(id) on delete cascade;

create unique index if not exists mission_progress_occurrence_unique
  on public.mission_progress_events(occurrence_id)
  where occurrence_id is not null;

-- Activity rows created by the operation triggers are already paired with a
-- progress event.  Keep the generic activity trigger from counting them again.
create or replace function public.aegis_progress_from_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source_type not in ('operations', 'operation_occurrences') then
    perform public.aegis_increment_mission(new.user_id, new.metric_key, new.id, 1);
  end if;
  return new;
end $$;

-- Link and advance a normal operation.  INSERT is included so an operation
-- created already complete cannot bypass mission progress.
create or replace function public.aegis_sync_operation_progress()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mission uuid;
  v_event uuid;
  v_old_mission uuid;
  v_old_amount integer;
  v_amount integer := greatest(1, coalesce(new.mission_increment, 1));
  v_was_completed boolean := false;
begin
  if tg_op <> 'INSERT' then
    v_was_completed := coalesce(old.completed, false);
  end if;

  -- Prefer an explicit link, but never allow a link belonging to another user
  -- or a deleted mission to survive.  Metric matching is the generic fallback.
  if new.mission_id is not null then
    select id into v_mission
    from public.missions
    where id = new.mission_id and user_id = new.user_id;
  end if;
  if v_mission is null and new.metric_key is not null then
    select id into v_mission
    from public.missions
    where user_id = new.user_id
      and completed is false
      and public.aegis_metric_matches(metric_key, new.metric_key)
    order by created_at asc
    limit 1;
  end if;
  new.mission_id := v_mission;

  -- If a completed operation is relinked, remove the old event before adding
  -- the event for its new mission.  A unique operation_id makes this idempotent.
  if v_was_completed and (not coalesce(new.completed, false) or new.mission_id is distinct from old.mission_id) then
    select mission_id, amount into v_old_mission, v_old_amount
    from public.mission_progress_events
    where operation_id = new.id;
    if v_old_mission is not null then
      delete from public.mission_progress_events where operation_id = new.id;
      update public.missions
      set completed_count = greatest(0, coalesce(completed_count, 0) - greatest(1, coalesce(v_old_amount, 1))),
          completed = greatest(0, coalesce(completed_count, 0) - greatest(1, coalesce(v_old_amount, 1))) >= coalesce(target_count, 1)
      where id = v_old_mission and user_id = new.user_id;
    end if;
    delete from public.activity_events where source_type = 'operations' and source_id = new.id;
    new.mission_incremented := false;
  end if;

  if coalesce(new.completed, false) and (not v_was_completed or not exists (
    select 1 from public.mission_progress_events where operation_id = new.id
  )) and v_mission is not null then
    insert into public.mission_progress_events(user_id, mission_id, operation_id, amount)
    values (new.user_id, v_mission, new.id, v_amount)
    on conflict (operation_id) do nothing
    returning id into v_event;
    if v_event is not null then
      update public.missions
      set completed_count = least(coalesce(target_count, 1), coalesce(completed_count, 0) + v_amount),
          completed = coalesce(completed_count, 0) + v_amount >= coalesce(target_count, 1)
      where id = v_mission and user_id = new.user_id;
    end if;
    new.mission_incremented := v_event is not null;
    insert into public.activity_events(user_id, source_type, source_id, metric_key, occurred_at, metadata)
    values (new.user_id, 'operations', new.id, coalesce(new.metric_key, 'operation.complete'), now(),
      jsonb_build_object('title', new.title, 'category', new.category, 'mission_id', v_mission))
    on conflict (source_type, source_id) do nothing;
  elsif not coalesce(new.completed, false) then
    new.mission_incremented := false;
  end if;
  return new;
end $$;

drop trigger if exists aegis_operation_progress on public.operations;
create trigger aegis_operation_progress
  before insert or update on public.operations
  for each row execute function public.aegis_sync_operation_progress();

-- Each recurring date is its own measurable event.  The parent operation is
-- used only to find the mission and metric; occurrence_id provides the
-- idempotency key so Monday and Wednesday can both advance the same mission.
create or replace function public.aegis_sync_occurrence_progress()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_operation public.operations%rowtype;
  v_mission uuid;
  v_event uuid;
  v_activity uuid;
  v_old_mission uuid;
  v_old_amount integer;
  v_was_completed boolean := false;
begin
  if tg_op <> 'INSERT' then
    v_was_completed := coalesce(old.completed, false);
  end if;

  select * into v_operation
  from public.operations
  where id = new.operation_id and user_id = new.user_id;
  if not found then return new; end if;

  -- Use the durable event for reversal before trying to resolve the current
  -- mission. This still decrements correctly if the mission reached its
  -- target or the parent link was edited after the occurrence was completed.
  if v_was_completed and not coalesce(new.completed, false) then
    select mission_id, amount into v_old_mission, v_old_amount
    from public.mission_progress_events
    where occurrence_id = new.id;
    if v_old_mission is not null then
      delete from public.mission_progress_events where occurrence_id = new.id;
      update public.missions
      set completed_count = greatest(0, coalesce(completed_count, 0) - greatest(1, coalesce(v_old_amount, 1))),
          completed = greatest(0, coalesce(completed_count, 0) - greatest(1, coalesce(v_old_amount, 1))) >= coalesce(target_count, 1)
      where id = v_old_mission and user_id = new.user_id;
    end if;
    delete from public.activity_events where source_type = 'operation_occurrences' and source_id = new.id;
    return new;
  end if;

  v_mission := v_operation.mission_id;
  if v_mission is not null then
    perform 1 from public.missions where id = v_mission and user_id = new.user_id;
    if not found then v_mission := null; end if;
  end if;
  if v_mission is null and v_operation.metric_key is not null then
    select id into v_mission
    from public.missions
    where user_id = new.user_id
      and completed is false
      and public.aegis_metric_matches(metric_key, v_operation.metric_key)
    order by created_at asc
    limit 1;
    if v_mission is not null and v_operation.mission_id is null then
      update public.operations set mission_id = v_mission where id = v_operation.id and user_id = new.user_id;
    end if;
  end if;
  if v_mission is null then return new; end if;

  if coalesce(new.completed, false) and (not v_was_completed or not exists (
    select 1 from public.mission_progress_events where occurrence_id = new.id
  )) then
    insert into public.activity_events(user_id, source_type, source_id, metric_key, occurred_at, metadata)
    values (new.user_id, 'operation_occurrences', new.id, coalesce(v_operation.metric_key, 'operation.complete'), now(),
      jsonb_build_object('title', v_operation.title, 'category', v_operation.category, 'occurrence_date', new.occurrence_date))
    on conflict (source_type, source_id) do nothing
    returning id into v_activity;
    insert into public.mission_progress_events(user_id, mission_id, occurrence_id, activity_event_id, amount)
    values (new.user_id, v_mission, new.id, v_activity, 1)
    on conflict do nothing
    returning id into v_event;
    if v_event is not null then
      update public.missions
      set completed_count = least(coalesce(target_count, 1), coalesce(completed_count, 0) + 1),
          completed = coalesce(completed_count, 0) + 1 >= coalesce(target_count, 1)
      where id = v_mission and user_id = new.user_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists aegis_occurrence_progress on public.operation_occurrences;
create trigger aegis_occurrence_progress
  before insert or update on public.operation_occurrences
  for each row execute function public.aegis_sync_occurrence_progress();

-- Re-run the idempotent completion branch for rows created by older versions.
update public.operations set completed = completed where completed is true;
update public.operation_occurrences set completed = completed where completed is true;

grant execute on function public.aegis_sync_occurrence_progress() to authenticated;
