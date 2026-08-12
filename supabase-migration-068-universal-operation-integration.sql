-- AEGIS 068 — one universal operation -> mission/recovery integration path.
-- Run once in Supabase SQL Editor after migrations 045–046.

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.operations, public.operation_occurrences to authenticated;
grant all privileges on public.operations, public.operation_occurrences to service_role;

-- Normalize legacy labels without changing the meaning of the operation.
update public.operations
set category = 'Self Mastery'
where category in ('Mind', 'Body');

create or replace function public.aegis_infer_operation_metric(p_title text, p_metric text)
returns text language plpgsql immutable as $$
declare
  v_title text := lower(coalesce(p_title, ''));
  v_metric text := lower(nullif(trim(coalesce(p_metric, '')), ''));
begin
  if v_metric is not null and v_metric not in ('operation.complete', 'operation_completion') then
    return v_metric;
  end if;
  if v_title ~ '(physical therapy|\mpt\M|orthopedic|acl|rehab)' then return 'pt_session'; end if;
  if v_title ~ '(read one chapter|read chapter|chapter)' then return 'chapters_read'; end if;
  if v_title ~ '(gym|workout|strength training|resistance)' then return 'gym_session'; end if;
  if v_title ~ '(trade|trading|pre-market|pre market|chart|backtest)' then return 'trading.trade'; end if;
  if v_title ~ '(^journal$|journal|mind entry|self mastery entry)' then return 'mastery.entry'; end if;
  if v_title ~ '(recovery report|log recovery|pain|swelling)' then return 'recovery.report'; end if;
  return v_metric;
end $$;

create or replace function public.aegis_operation_metric_matches(p_mission text, p_operation text)
returns boolean language plpgsql immutable as $$
declare
  m text := lower(coalesce(p_mission, ''));
  o text := lower(coalesce(p_operation, ''));
begin
  if m = '' or o = '' then return false; end if;
  if m = o then return true; end if;
  if m in ('pt_session', 'recovery.pt_session', 'recovery.report') and o in ('pt_session', 'recovery.pt_session', 'recovery.report') then return true; end if;
  if m in ('chapters_read', 'mastery.book', 'mind.book') and o in ('chapters_read', 'mastery.book', 'mind.book') then return true; end if;
  if m in ('gym_session', 'body.gym', 'mastery.gym') and o in ('gym_session', 'body.gym', 'mastery.gym') then return true; end if;
  if m in ('trading.trade', 'trading.review', 'trade_review') and o in ('trading.trade', 'trading.review', 'trade_review') then return true; end if;
  if m in ('mastery.entry', 'mastery.journal', 'mind.entry') and o in ('mastery.entry', 'mastery.journal', 'mind.entry') then return true; end if;
  return false;
end $$;

create or replace function public.aegis_normalize_operation_link()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_metric text;
  v_mission public.missions%rowtype;
  v_category text := initcap(lower(coalesce(new.category, '')));
begin
  v_metric := public.aegis_infer_operation_metric(new.title, new.metric_key);

  if new.mission_id is not null then
    select * into v_mission from public.missions
    where id = new.mission_id and user_id = new.user_id;
    if not found then new.mission_id := null; end if;
  end if;

  if v_mission.id is null then
    select * into v_mission
    from public.missions m
    where m.user_id = new.user_id
      and (m.completed is false or new.completed is true)
      and (
        (v_metric is not null and public.aegis_operation_metric_matches(m.metric_key, v_metric))
        or (lower(coalesce(new.title, '')) ~ '(physical therapy|\mpt\M|orthopedic|acl|rehab)' and lower(coalesce(m.title, '') || ' ' || coalesce(m.completion_definition, '')) ~ '(orthopedic|recovery|pt|rehab|session)')
        or (lower(coalesce(new.title, '')) ~ '(gym|workout|strength)' and lower(coalesce(m.title, '') || ' ' || coalesce(m.completion_definition, '')) ~ '(training|gym|strength|workout)')
        or (lower(coalesce(new.title, '')) ~ '(read one chapter|read chapter|chapter)' and lower(coalesce(m.title, '') || ' ' || coalesce(m.completion_definition, '')) ~ '(book|chapter|learning)')
        or (lower(coalesce(new.title, '')) ~ '(trade|trading|pre-market|chart|backtest)' and lower(coalesce(m.title, '') || ' ' || coalesce(m.completion_definition, '')) ~ '(trade|trading|playbook|review)')
      )
    order by (m.completed = true), m.created_at asc
    limit 1;
  end if;

  if v_mission.id is not null then
    new.mission_id := v_mission.id;
    v_category := initcap(lower(coalesce(v_mission.category, v_category)));
  end if;
  if v_category in ('Mind', 'Body', 'Mastery') or v_category = '' then v_category := 'Self Mastery'; end if;
  if v_category not in ('Recovery', 'Trading', 'Business', 'Self Mastery', 'Life Admin') then
    v_category := 'Self Mastery';
  end if;
  new.category := v_category;
  new.metric_key := coalesce(v_metric, new.metric_key);
  return new;
end $$;

drop trigger if exists aegis_normalize_operation_link on public.operations;
create trigger aegis_normalize_operation_link
before insert or update of title, category, mission_id, metric_key, completed on public.operations
for each row execute function public.aegis_normalize_operation_link();

-- Repair existing records, then rebuild measured counts from durable completed
-- operation/occurrence evidence. This is idempotent and does not create XP.
update public.operations set title = title where true;

do $$
declare
  m record;
  observed integer;
begin
  for m in select id, target_count from public.missions where completion_type = 'units' and target_count is not null loop
    select least(m.target_count, count(*)::integer) into observed
    from (
      select o.id::text as evidence_id
      from public.operations o
      where o.mission_id = m.id and o.completed is true
        and coalesce(o.schedule_mode, 'one_time') not in ('recurring', 'weekly', 'daily')
        and lower(coalesce(o.title, '')) not like '%evening%mission%debrief%'
      union
      select ('occurrence:' || oo.id::text) as evidence_id
      from public.operation_occurrences oo
      join public.operations o on o.id = oo.operation_id and o.user_id = oo.user_id
      where o.mission_id = m.id and oo.completed is true
        and lower(coalesce(o.title, '')) not like '%evening%mission%debrief%'
    ) evidence;
    update public.missions
    set completed_count = coalesce(observed, 0),
        completed = coalesce(observed, 0) >= target_count,
        progress = round((coalesce(observed, 0)::numeric / target_count::numeric) * 100)::integer
    where id = m.id;
  end loop;
end $$;

grant execute on function public.aegis_infer_operation_metric(text, text) to authenticated;
grant execute on function public.aegis_operation_metric_matches(text, text) to authenticated;
grant execute on function public.aegis_normalize_operation_link() to authenticated;
