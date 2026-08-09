-- AEGIS 040 — unified activity, mission progress, operations, and reviews.
-- Run this once in Supabase SQL Editor. It intentionally does NOT backfill XP.

alter table public.missions
  add column if not exists metric_key text,
  add column if not exists cadence_type text check (cadence_type in ('daily', 'weekly') or cadence_type is null),
  add column if not exists cadence_target integer,
  add column if not exists description text;

alter table public.operations
  add column if not exists metric_key text,
  add column if not exists details text,
  add column if not exists schedule_mode text not null default 'one_time' check (schedule_mode in ('one_time', 'recurring')),
  add column if not exists recurrence_days integer[],
  add column if not exists recurrence_time time;

alter table public.trade_debriefs add column if not exists debrief_note text;
alter table public.health_food_logs
  add column if not exists quantity_text text,
  add column if not exists carbs_g numeric,
  add column if not exists estimate_source text,
  add column if not exists estimated_at timestamptz;

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  source_id uuid,
  metric_key text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists activity_events_user_occurred_idx on public.activity_events (user_id, occurred_at desc);
create unique index if not exists activity_events_source_unique on public.activity_events (source_type, source_id) where source_id is not null;

create table if not exists public.mission_progress_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id uuid not null references public.missions(id) on delete cascade,
  operation_id uuid unique references public.operations(id) on delete cascade,
  amount integer not null default 1 check (amount > 0),
  created_at timestamptz not null default now()
);
create index if not exists mission_progress_events_mission_idx on public.mission_progress_events (mission_id, created_at desc);

alter table public.activity_events enable row level security;
alter table public.mission_progress_events enable row level security;
drop policy if exists "activity events private" on public.activity_events;
create policy "activity events private" on public.activity_events for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "mission progress private" on public.mission_progress_events;
create policy "mission progress private" on public.mission_progress_events for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.aegis_log_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_metric text;
  v_meta jsonb;
begin
  if tg_table_name = 'mastery_entries' then
    v_metric := 'mastery.' || lower(coalesce(new.entry_type, 'entry'));
    v_meta := jsonb_build_object('lane', new.lane, 'entry_type', new.entry_type, 'category', new.category);
  elsif tg_table_name = 'training_sessions' then
    v_metric := 'body.gym'; v_meta := jsonb_build_object('workout_split', new.workout_split);
  elsif tg_table_name = 'health_weight_logs' then
    v_metric := 'health.weight'; v_meta := '{}'::jsonb;
  elsif tg_table_name = 'health_food_logs' then
    v_metric := 'health.nutrition'; v_meta := jsonb_build_object('food', new.food_name);
  elsif tg_table_name = 'trade_debriefs' then
    v_metric := 'trading.trade'; v_meta := jsonb_build_object('outcome', new.outcome);
  elsif tg_table_name = 'recovery_logs' then
    v_metric := 'recovery.report'; v_meta := jsonb_build_object('rehab_completed', new.rehab_completed);
  else
    return new;
  end if;
  insert into public.activity_events(user_id, source_type, source_id, metric_key, occurred_at, metadata)
  values (new.user_id, tg_table_name, new.id, v_metric, coalesce(new.created_at, now()), v_meta)
  on conflict (source_type, source_id) do nothing;
  return new;
end $$;

drop trigger if exists aegis_mastery_activity on public.mastery_entries;
create trigger aegis_mastery_activity after insert on public.mastery_entries for each row execute function public.aegis_log_activity();
drop trigger if exists aegis_training_activity on public.training_sessions;
create trigger aegis_training_activity after insert on public.training_sessions for each row execute function public.aegis_log_activity();
drop trigger if exists aegis_weight_activity on public.health_weight_logs;
create trigger aegis_weight_activity after insert on public.health_weight_logs for each row execute function public.aegis_log_activity();
drop trigger if exists aegis_food_activity on public.health_food_logs;
create trigger aegis_food_activity after insert on public.health_food_logs for each row execute function public.aegis_log_activity();
drop trigger if exists aegis_trade_activity on public.trade_debriefs;
create trigger aegis_trade_activity after insert on public.trade_debriefs for each row execute function public.aegis_log_activity();
drop trigger if exists aegis_recovery_activity on public.recovery_logs;
create trigger aegis_recovery_activity after insert on public.recovery_logs for each row execute function public.aegis_log_activity();

create or replace function public.aegis_sync_operation_progress()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mission uuid;
  v_amount integer := greatest(1, coalesce(new.mission_increment, 1));
begin
  if new.completed is true and coalesce(old.completed, false) is false then
    v_mission := new.mission_id;
    if v_mission is null and new.metric_key is not null then
      select id into v_mission from public.missions
      where user_id = new.user_id and completed is false and metric_key = new.metric_key
      order by created_at asc limit 1;
    end if;
    if v_mission is not null then
      insert into public.mission_progress_events(user_id, mission_id, operation_id, amount)
      values (new.user_id, v_mission, new.id, v_amount) on conflict (operation_id) do nothing;
      update public.missions
        set completed_count = least(coalesce(target_count, 1), coalesce(completed_count, 0) + v_amount),
            completed = coalesce(completed_count, 0) + v_amount >= coalesce(target_count, 1)
        where id = v_mission and user_id = new.user_id;
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

drop trigger if exists aegis_operation_progress on public.operations;
create trigger aegis_operation_progress before update of completed on public.operations for each row execute function public.aegis_sync_operation_progress();

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.activity_events, public.mission_progress_events to authenticated;
