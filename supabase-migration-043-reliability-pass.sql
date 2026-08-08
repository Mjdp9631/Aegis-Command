-- AEGIS 043 — one reliable activity pipeline.
-- Run after migrations 040–042. This does NOT reset XP or alter historical totals.

alter table public.missions
  add column if not exists operation_template jsonb not null default '{}'::jsonb,
  add column if not exists cadence_period_start date;

alter table public.activity_events
  add column if not exists quantity integer not null default 1;

-- Make every loggable system write a durable activity event. Mission progress,
-- Character, Mastery, and advisory scans can now consume the same evidence.
create or replace function public.aegis_log_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_source_type text := tg_table_name;
  v_source_id uuid := new.id;
  v_metric text;
  v_meta jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'mastery_entries' then
    v_metric := 'mastery.' || lower(coalesce(new.entry_type, new.category, 'entry'));
    v_meta := jsonb_build_object('lane', new.lane, 'category', new.category, 'entry_type', new.entry_type, 'title', new.title);
  elsif tg_table_name = 'training_sessions' then
    v_metric := 'body.gym';
    v_meta := jsonb_build_object('split', new.workout_split, 'title', new.title);
  elsif tg_table_name = 'health_weight_logs' then
    v_metric := 'health.weight';
  elsif tg_table_name = 'health_food_logs' then
    v_metric := 'health.nutrition';
    v_meta := jsonb_build_object('food', new.food_name, 'quantity', coalesce(new.quantity_text, ''));
  elsif tg_table_name = 'trade_debriefs' then
    v_metric := 'trading.trade';
    v_meta := jsonb_build_object('pair', new.pair, 'outcome', new.outcome, 'followed_plan', not coalesce(new.plan_violation, false));
  elsif tg_table_name = 'recovery_logs' then
    v_metric := 'recovery.report';
  else
    return new;
  end if;

  insert into public.activity_events(user_id, source_type, source_id, metric_key, occurred_at, quantity, metadata)
  values (new.user_id, v_source_type, v_source_id, v_metric, coalesce(new.created_at, now()), 1, v_meta)
  on conflict (source_type, source_id) do update
    set metric_key = excluded.metric_key, metadata = excluded.metadata, quantity = excluded.quantity;
  return new;
end $$;

drop trigger if exists aegis_activity_mastery on public.mastery_entries;
drop trigger if exists aegis_activity_training on public.training_sessions;
drop trigger if exists aegis_activity_weight on public.health_weight_logs;
drop trigger if exists aegis_activity_food on public.health_food_logs;
drop trigger if exists aegis_activity_trade on public.trade_debriefs;
drop trigger if exists aegis_activity_recovery on public.recovery_logs;

create trigger aegis_activity_mastery after insert or update on public.mastery_entries for each row execute function public.aegis_log_activity();
create trigger aegis_activity_training after insert or update on public.training_sessions for each row execute function public.aegis_log_activity();
create trigger aegis_activity_weight after insert or update on public.health_weight_logs for each row execute function public.aegis_log_activity();
create trigger aegis_activity_food after insert or update on public.health_food_logs for each row execute function public.aegis_log_activity();
create trigger aegis_activity_trade after insert or update on public.trade_debriefs for each row execute function public.aegis_log_activity();
create trigger aegis_activity_recovery after insert or update on public.recovery_logs for each row execute function public.aegis_log_activity();

-- One map covers every existing and future Mastery category automatically.
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
    or (lower(coalesce(p_mission, '')) = 'body_entry' and (lower(coalesce(p_event, '')) like 'body.%' or lower(coalesce(p_event, '')) in ('health.weight', 'health.nutrition')))
    or (lower(coalesce(p_mission, '')) = 'mastery_entry' and lower(coalesce(p_event, '')) like 'mastery.%')
$$;

-- Historical records are deliberately not backfilled. XP is already live;
-- only work logged after this migration can advance future counters.

grant execute on function public.aegis_metric_matches(text, text) to authenticated;
