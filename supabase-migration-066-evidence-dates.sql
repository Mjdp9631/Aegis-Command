-- AEGIS 066 - one user-selected evidence date for every manually logged system.
-- Run after migrations 060-065 in the Supabase SQL Editor.

-- Mind, deep work, Business, and the financial baseline previously relied on
-- created_at/updated_at. Keep those timestamps for audit history, but use the
-- selected evidence date for counting, XP, AI context, and activity events.
alter table public.mastery_entries add column if not exists logged_on date;
alter table public.deep_work_logs add column if not exists logged_on date;
alter table public.business_projects add column if not exists logged_on date;
alter table public.content_items add column if not exists logged_on date;
alter table public.financial_foundations add column if not exists logged_on date;

alter table public.training_sessions alter column logged_on set default ((now() at time zone 'America/New_York')::date);
alter table public.training_sets alter column logged_on set default ((now() at time zone 'America/New_York')::date);
alter table public.health_weight_logs alter column logged_on set default ((now() at time zone 'America/New_York')::date);
alter table public.health_food_logs alter column logged_on set default ((now() at time zone 'America/New_York')::date);
alter table public.capability_skill_logs alter column practiced_on set default ((now() at time zone 'America/New_York')::date);

update public.mastery_entries
set logged_on = (created_at at time zone 'America/New_York')::date
where logged_on is null;
update public.deep_work_logs
set logged_on = (created_at at time zone 'America/New_York')::date
where logged_on is null;
update public.business_projects
set logged_on = (created_at at time zone 'America/New_York')::date
where logged_on is null;
update public.content_items
set logged_on = (created_at at time zone 'America/New_York')::date
where logged_on is null;
update public.financial_foundations
set logged_on = (updated_at at time zone 'America/New_York')::date
where logged_on is null;

update public.training_sessions
set logged_on = (created_at at time zone 'America/New_York')::date
where logged_on = ((created_at at time zone 'America/New_York')::date + 1);
update public.health_weight_logs
set logged_on = (created_at at time zone 'America/New_York')::date
where logged_on = ((created_at at time zone 'America/New_York')::date + 1);
update public.health_food_logs
set logged_on = (created_at at time zone 'America/New_York')::date
where logged_on = ((created_at at time zone 'America/New_York')::date + 1);
update public.capability_skill_logs
set practiced_on = (created_at at time zone 'America/New_York')::date
where practiced_on = ((created_at at time zone 'America/New_York')::date + 1);
update public.training_sets as sets
set logged_on = sessions.logged_on
from public.training_sessions as sessions
where sets.session_id = sessions.id
  and sets.logged_on is distinct from sessions.logged_on;

alter table public.mastery_entries alter column logged_on set default ((now() at time zone 'America/New_York')::date);
alter table public.deep_work_logs alter column logged_on set default ((now() at time zone 'America/New_York')::date);
alter table public.business_projects alter column logged_on set default ((now() at time zone 'America/New_York')::date);
alter table public.content_items alter column logged_on set default ((now() at time zone 'America/New_York')::date);
alter table public.financial_foundations alter column logged_on set default ((now() at time zone 'America/New_York')::date);

alter table public.mastery_entries alter column logged_on set not null;
alter table public.deep_work_logs alter column logged_on set not null;
alter table public.business_projects alter column logged_on set not null;
alter table public.content_items alter column logged_on set not null;
alter table public.financial_foundations alter column logged_on set not null;

create index if not exists mastery_entries_user_logged_on_idx on public.mastery_entries (user_id, logged_on desc);
create index if not exists deep_work_logs_user_logged_on_idx on public.deep_work_logs (user_id, logged_on desc);
create index if not exists business_projects_user_logged_on_idx on public.business_projects (user_id, logged_on desc);
create index if not exists content_items_user_logged_on_idx on public.content_items (user_id, logged_on desc);

-- All activity-trigger paths use the evidence date, never the browser/server
-- insertion timestamp, when a date column exists.
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
    v_occurred_at := coalesce(new.logged_on::timestamptz, new.created_at, now());
    v_meta := jsonb_build_object('domain', 'Mind', 'category', new.category, 'title', new.title, 'logged_on', new.logged_on);
  elsif tg_table_name = 'training_sessions' then
    v_metric := 'body.' || lower(coalesce(new.session_type, 'gym'));
    v_occurred_at := coalesce(new.logged_on::timestamptz, new.created_at, now());
    v_meta := jsonb_build_object('domain', 'Body', 'category', coalesce(new.session_type, 'Gym'), 'title', new.title, 'logged_on', new.logged_on);
  elsif tg_table_name = 'health_weight_logs' then
    v_metric := 'health.weight';
    v_occurred_at := coalesce(new.logged_on::timestamptz, now());
    v_meta := jsonb_build_object('domain', 'Body', 'logged_on', new.logged_on);
  elsif tg_table_name = 'health_food_logs' then
    v_metric := 'health.nutrition';
    v_occurred_at := coalesce(new.logged_on::timestamptz, now());
    v_meta := jsonb_build_object('domain', 'Body', 'logged_on', new.logged_on, 'food', new.food_name, 'quantity', coalesce(new.quantity_text, ''));
  elsif tg_table_name = 'trade_debriefs' then
    v_metric := 'trading.trade';
    v_occurred_at := coalesce(new.traded_at, new.created_at, now());
    v_meta := jsonb_build_object('domain', 'Trading', 'pair', new.pair, 'outcome', new.outcome, 'followed_plan', not coalesce(new.plan_violation, false));
  elsif tg_table_name = 'recovery_logs' then
    v_metric := 'recovery.report';
    v_occurred_at := coalesce(new.logged_on::timestamptz, new.created_at, now());
    v_meta := jsonb_build_object('domain', 'Body', 'logged_on', new.logged_on, 'rehab_completed', new.rehab_completed);
  elsif tg_table_name = 'deep_work_logs' then
    v_metric := lower(coalesce(new.area, 'mind')) || '.deep_work';
    v_occurred_at := coalesce(new.logged_on::timestamptz, new.created_at, now());
    v_meta := jsonb_build_object('domain', new.area, 'logged_on', new.logged_on, 'focus', new.focus, 'duration_minutes', new.duration_minutes);
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
    v_occurred_at := coalesce(new.logged_on::timestamptz, new.created_at, now());
    v_meta := jsonb_build_object('domain', 'Business', 'title', new.title, 'logged_on', new.logged_on);
  elsif tg_table_name = 'content_items' then
    if new.status <> 'Published' then
      delete from public.activity_events where source_type = v_source_type and source_id = v_source_id;
      return new;
    end if;
    v_metric := 'business.content';
    v_occurred_at := coalesce(new.logged_on::timestamptz, new.created_at, now());
    v_meta := jsonb_build_object('domain', 'Business', 'title', new.title, 'platform', new.platform, 'logged_on', new.logged_on);
  else
    return new;
  end if;

  insert into public.activity_events(user_id, source_type, source_id, metric_key, occurred_at, quantity, metadata)
  values (new.user_id, v_source_type, v_source_id, v_metric, v_occurred_at, 1, v_meta)
  on conflict (source_type, source_id) do update
    set metric_key = excluded.metric_key, occurred_at = excluded.occurred_at,
        quantity = excluded.quantity, metadata = excluded.metadata;
  return new;
end $$;

-- Re-point existing derived events to their explicit evidence dates.
update public.activity_events event
set occurred_at = source.logged_on::timestamptz,
    metadata = coalesce(event.metadata, '{}'::jsonb) || jsonb_build_object('logged_on', source.logged_on)
from public.mastery_entries source
where event.source_type = 'mastery_entries' and event.source_id = source.id;

update public.activity_events event
set occurred_at = source.logged_on::timestamptz,
    metadata = coalesce(event.metadata, '{}'::jsonb) || jsonb_build_object('logged_on', source.logged_on)
from public.deep_work_logs source
where event.source_type = 'deep_work_logs' and event.source_id = source.id;

update public.activity_events event
set occurred_at = source.logged_on::timestamptz,
    metadata = coalesce(event.metadata, '{}'::jsonb) || jsonb_build_object('logged_on', source.logged_on)
from public.business_projects source
where event.source_type = 'business_projects' and event.source_id = source.id and source.status = 'Complete';

update public.activity_events event
set occurred_at = source.logged_on::timestamptz,
    metadata = coalesce(event.metadata, '{}'::jsonb) || jsonb_build_object('logged_on', source.logged_on)
from public.content_items source
where event.source_type = 'content_items' and event.source_id = source.id and source.status = 'Published';

update public.activity_events event
set occurred_at = source.logged_on::timestamptz,
    metadata = coalesce(event.metadata, '{}'::jsonb) || jsonb_build_object('logged_on', source.logged_on)
from public.training_sessions source
where event.source_type = 'training_sessions' and event.source_id = source.id;
