-- AEGIS 047 — audit and normalize every activity source used by counters.
-- Run after migrations 040–046. This is idempotent and does not rewrite XP
-- campaign start dates or delete historical evidence.

alter table public.activity_events
  add column if not exists quantity integer not null default 1;

-- Keep the source key globally unique so the existing operation and occurrence
-- triggers can use one conflict target. PostgreSQL still permits multiple NULL
-- source IDs under a normal unique index.
drop index if exists public.activity_events_source_unique;
create unique index if not exists activity_events_source_unique
  on public.activity_events (source_type, source_id);

update public.activity_events
set quantity = greatest(1, coalesce(quantity, 1))
where quantity is null or quantity < 1;

alter table public.activity_events
  drop constraint if exists activity_events_quantity_check;

alter table public.activity_events
  add constraint activity_events_quantity_check check (quantity > 0);

-- A single trigger mapping keeps the activity ledger aligned with the same
-- Mind/Body/Trading/Recovery/Business vocabulary used by the UI counters.
create or replace function public.aegis_log_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_source_type text := tg_table_name;
  v_source_id uuid := new.id;
  v_metric text;
  v_occurred_at timestamptz := now();
  v_meta jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'mastery_entries' then
    v_metric := 'mastery.' || lower(replace(coalesce(new.category, 'entry'), ' ', '_'));
    v_occurred_at := coalesce(new.created_at, now());
    v_meta := jsonb_build_object('domain', 'Mind', 'category', new.category, 'title', new.title);
  elsif tg_table_name = 'training_sessions' then
    v_metric := 'body.' || lower(coalesce(new.session_type, 'gym'));
    v_occurred_at := coalesce(new.created_at, new.logged_on::timestamptz, now());
    v_meta := jsonb_build_object('domain', 'Body', 'category', coalesce(new.session_type, 'Gym'), 'title', new.title);
  elsif tg_table_name = 'health_weight_logs' then
    v_metric := 'health.weight';
    v_occurred_at := coalesce(new.logged_on::timestamptz, now());
    v_meta := jsonb_build_object('domain', 'Body', 'logged_on', new.logged_on);
  elsif tg_table_name = 'health_food_logs' then
    v_metric := 'health.nutrition';
    v_occurred_at := coalesce(new.logged_on::timestamptz, now());
    v_meta := jsonb_build_object('domain', 'Body', 'food', new.food_name, 'quantity', coalesce(new.quantity_text, ''));
  elsif tg_table_name = 'trade_debriefs' then
    v_metric := 'trading.trade';
    v_occurred_at := coalesce(new.traded_at, new.created_at, now());
    v_meta := jsonb_build_object('domain', 'Trading', 'pair', new.pair, 'outcome', new.outcome, 'followed_plan', not coalesce(new.plan_violation, false));
  elsif tg_table_name = 'recovery_logs' then
    v_metric := 'recovery.report';
    v_occurred_at := coalesce(new.logged_on::timestamptz, new.created_at, now());
    v_meta := jsonb_build_object('domain', 'Body', 'rehab_completed', new.rehab_completed);
  elsif tg_table_name = 'deep_work_logs' then
    v_metric := lower(coalesce(new.area, 'mind')) || '.deep_work';
    v_occurred_at := coalesce(new.created_at, new.logged_on::timestamptz, now());
    v_meta := jsonb_build_object('domain', new.area, 'focus', new.focus, 'duration_minutes', new.duration_minutes);
  elsif tg_table_name = 'mastery_challenges' then
    if lower(coalesce(new.status, '')) <> 'completed' then
      delete from public.activity_events where source_type = v_source_type and source_id = v_source_id;
      return new;
    end if;
    v_metric := case when lower(coalesce(new.lane, 'mind')) = 'body' then 'body.challenge' else 'mind.challenge' end;
    v_occurred_at := coalesce(new.completed_at, new.created_at, now());
    v_meta := jsonb_build_object('domain', case when lower(coalesce(new.lane, 'mind')) = 'body' then 'Body' else 'Mind' end, 'title', new.title, 'xp_reward', coalesce(new.xp_reward, 0));
  elsif tg_table_name = 'business_projects' then
    if new.status <> 'Complete' then
      delete from public.activity_events where source_type = v_source_type and source_id = v_source_id;
      return new;
    end if;
    v_metric := 'business.project';
    v_occurred_at := coalesce(new.created_at, now());
    v_meta := jsonb_build_object('domain', 'Business', 'title', new.title);
  elsif tg_table_name = 'content_items' then
    if new.status <> 'Published' then
      delete from public.activity_events where source_type = v_source_type and source_id = v_source_id;
      return new;
    end if;
    v_metric := 'business.content';
    v_occurred_at := coalesce(new.created_at, now());
    v_meta := jsonb_build_object('domain', 'Business', 'title', new.title, 'platform', new.platform);
  else
    return new;
  end if;

  insert into public.activity_events(user_id, source_type, source_id, metric_key, occurred_at, quantity, metadata)
  values (new.user_id, v_source_type, v_source_id, v_metric, v_occurred_at, 1, v_meta)
  on conflict (source_type, source_id) do update
    set metric_key = excluded.metric_key,
        occurred_at = excluded.occurred_at,
        quantity = excluded.quantity,
        metadata = excluded.metadata;
  return new;
end $$;

drop trigger if exists aegis_activity_mastery on public.mastery_entries;
create trigger aegis_activity_mastery after insert or update on public.mastery_entries for each row execute function public.aegis_log_activity();
drop trigger if exists aegis_activity_training on public.training_sessions;
create trigger aegis_activity_training after insert or update on public.training_sessions for each row execute function public.aegis_log_activity();
drop trigger if exists aegis_activity_weight on public.health_weight_logs;
create trigger aegis_activity_weight after insert or update on public.health_weight_logs for each row execute function public.aegis_log_activity();
drop trigger if exists aegis_activity_food on public.health_food_logs;
create trigger aegis_activity_food after insert or update on public.health_food_logs for each row execute function public.aegis_log_activity();
drop trigger if exists aegis_activity_trade on public.trade_debriefs;
create trigger aegis_activity_trade after insert or update on public.trade_debriefs for each row execute function public.aegis_log_activity();
drop trigger if exists aegis_activity_recovery on public.recovery_logs;
create trigger aegis_activity_recovery after insert or update on public.recovery_logs for each row execute function public.aegis_log_activity();
drop trigger if exists aegis_activity_deep_work on public.deep_work_logs;
create trigger aegis_activity_deep_work after insert or update on public.deep_work_logs for each row execute function public.aegis_log_activity();
drop trigger if exists aegis_activity_challenge on public.mastery_challenges;
create trigger aegis_activity_challenge after insert or update on public.mastery_challenges for each row execute function public.aegis_log_activity();
drop trigger if exists aegis_activity_project on public.business_projects;
create trigger aegis_activity_project after insert or update on public.business_projects for each row execute function public.aegis_log_activity();
drop trigger if exists aegis_activity_content on public.content_items;
create trigger aegis_activity_content after insert or update on public.content_items for each row execute function public.aegis_log_activity();

-- Quantity is the single increment source for future measurable missions.
create or replace function public.aegis_progress_from_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source_type not in ('operations', 'operation_occurrences')
     and coalesce(current_setting('aegis.activity_backfill', true), 'false') <> 'true' then
    perform public.aegis_increment_mission(new.user_id, new.metric_key, new.id, greatest(1, coalesce(new.quantity, 1)));
  end if;
  return new;
end $$;

-- Repair existing event rows without duplicating their source records.
-- Backfill derived activity rows without treating old evidence as a new
-- mission increment. New user activity remains fully progress-aware.
select set_config('aegis.activity_backfill', 'true', true);

insert into public.activity_events(user_id, source_type, source_id, metric_key, occurred_at, quantity, metadata)
select user_id, 'mastery_entries', id, 'mastery.' || lower(replace(coalesce(category, 'entry'), ' ', '_')), coalesce(created_at, now()), 1,
       jsonb_build_object('domain', 'Mind', 'category', category, 'title', title)
from public.mastery_entries
on conflict (source_type, source_id) do update set metric_key = excluded.metric_key, occurred_at = excluded.occurred_at, metadata = excluded.metadata;

insert into public.activity_events(user_id, source_type, source_id, metric_key, occurred_at, quantity, metadata)
select user_id, 'training_sessions', id, 'body.' || lower(coalesce(session_type, 'gym')), coalesce(created_at, logged_on::timestamptz, now()), 1,
       jsonb_build_object('domain', 'Body', 'category', coalesce(session_type, 'Gym'), 'title', title)
from public.training_sessions
on conflict (source_type, source_id) do update set metric_key = excluded.metric_key, occurred_at = excluded.occurred_at, metadata = excluded.metadata;

insert into public.activity_events(user_id, source_type, source_id, metric_key, occurred_at, quantity, metadata)
select user_id, 'health_weight_logs', id, 'health.weight', coalesce(logged_on::timestamptz, now()), 1,
       jsonb_build_object('domain', 'Body', 'logged_on', logged_on)
from public.health_weight_logs
on conflict (source_type, source_id) do update set metric_key = excluded.metric_key, occurred_at = excluded.occurred_at, metadata = excluded.metadata;

insert into public.activity_events(user_id, source_type, source_id, metric_key, occurred_at, quantity, metadata)
select user_id, 'health_food_logs', id, 'health.nutrition', coalesce(logged_on::timestamptz, now()), 1,
       jsonb_build_object('domain', 'Body', 'food', food_name, 'quantity', coalesce(quantity_text, ''))
from public.health_food_logs
on conflict (source_type, source_id) do update set metric_key = excluded.metric_key, occurred_at = excluded.occurred_at, metadata = excluded.metadata;

insert into public.activity_events(user_id, source_type, source_id, metric_key, occurred_at, quantity, metadata)
select user_id, 'trade_debriefs', id, 'trading.trade', coalesce(traded_at, created_at, now()), 1,
       jsonb_build_object('domain', 'Trading', 'pair', pair, 'outcome', outcome, 'followed_plan', not coalesce(plan_violation, false))
from public.trade_debriefs
on conflict (source_type, source_id) do update set metric_key = excluded.metric_key, occurred_at = excluded.occurred_at, metadata = excluded.metadata;

insert into public.activity_events(user_id, source_type, source_id, metric_key, occurred_at, quantity, metadata)
select user_id, 'recovery_logs', id, 'recovery.report', coalesce(logged_on::timestamptz, created_at, now()), 1,
       jsonb_build_object('domain', 'Body', 'rehab_completed', rehab_completed)
from public.recovery_logs
on conflict (source_type, source_id) do update set metric_key = excluded.metric_key, occurred_at = excluded.occurred_at, metadata = excluded.metadata;

insert into public.activity_events(user_id, source_type, source_id, metric_key, occurred_at, quantity, metadata)
select user_id, 'deep_work_logs', id, lower(coalesce(area, 'mind')) || '.deep_work', coalesce(created_at, logged_on::timestamptz, now()), 1,
       jsonb_build_object('domain', area, 'focus', focus, 'duration_minutes', duration_minutes)
from public.deep_work_logs
on conflict (source_type, source_id) do update set metric_key = excluded.metric_key, occurred_at = excluded.occurred_at, metadata = excluded.metadata;

insert into public.activity_events(user_id, source_type, source_id, metric_key, occurred_at, quantity, metadata)
select user_id, 'mastery_challenges', id,
       case when lower(coalesce(lane, 'mind')) = 'body' then 'body.challenge' else 'mind.challenge' end,
       coalesce(completed_at, created_at, now()), 1,
       jsonb_build_object('domain', case when lower(coalesce(lane, 'mind')) = 'body' then 'Body' else 'Mind' end, 'title', title, 'xp_reward', coalesce(xp_reward, 0))
from public.mastery_challenges
where status = 'completed'
on conflict (source_type, source_id) do update set metric_key = excluded.metric_key, occurred_at = excluded.occurred_at, metadata = excluded.metadata;

insert into public.activity_events(user_id, source_type, source_id, metric_key, occurred_at, quantity, metadata)
select user_id, 'business_projects', id, 'business.project', coalesce(created_at, now()), 1,
       jsonb_build_object('domain', 'Business', 'title', title)
from public.business_projects
where status = 'Complete'
on conflict (source_type, source_id) do update set metric_key = excluded.metric_key, occurred_at = excluded.occurred_at, metadata = excluded.metadata;

insert into public.activity_events(user_id, source_type, source_id, metric_key, occurred_at, quantity, metadata)
select user_id, 'content_items', id, 'business.content', coalesce(created_at, now()), 1,
       jsonb_build_object('domain', 'Business', 'title', title, 'platform', platform)
from public.content_items
where status = 'Published'
on conflict (source_type, source_id) do update set metric_key = excluded.metric_key, occurred_at = excluded.occurred_at, metadata = excluded.metadata;

select set_config('aegis.activity_backfill', 'false', true);

-- Re-run the idempotent operation paths so completed parent and recurring
-- instances are present in the same activity ledger as direct logs.
update public.operations set completed = completed where completed is true;
update public.operation_occurrences set completed = completed where completed is true;

grant execute on function public.aegis_log_activity() to authenticated;
grant execute on function public.aegis_progress_from_activity() to authenticated;
