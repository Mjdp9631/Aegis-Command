-- AEGIS 072 — one universal operation -> mission rule.
-- Run once after migration 071 in the Supabase SQL editor.
-- Every non-Life-Admin operation is assigned to an active mission unless
-- allow_unlinked is explicitly true. Life Admin remains unlinked by default.

alter table public.operations
  add column if not exists allow_unlinked boolean not null default false;

-- Older deployments allowed legacy categories such as Mind and Body.  The
-- universal trigger below normalizes those values, but PostgreSQL checks a
-- row's constraints before a trigger can finish if the old check rejects the
-- value.  Make this migration safe to run against that data shape, including
-- databases with an additional legacy category trigger.
drop trigger if exists aegis_normalize_operation_link on public.operations;

alter table public.operations
  drop constraint if exists operations_category_check;
alter table public.operations
  drop constraint if exists operations_category_check_v2;

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.operations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format(
      'alter table public.operations drop constraint if exists %I',
      constraint_row.conname
    );
  end loop;
end $$;

update public.operations as operation
set category = normalized.category
from (
  select id,
    case lower(trim(coalesce(category, '')))
      when 'recovery' then 'Recovery'
      when 'trading' then 'Trading'
      when 'business' then 'Business'
      when 'self mastery' then 'Self Mastery'
      when 'mind' then 'Self Mastery'
      when 'body' then 'Self Mastery'
      when 'mastery' then 'Self Mastery'
      when 'life admin' then 'Life Admin'
      when 'day to day' then 'Life Admin'
      when 'day-to-day' then 'Life Admin'
      else 'Self Mastery'
    end as category
  from public.operations
) as normalized
where operation.id = normalized.id
  and operation.category is distinct from normalized.category;

create or replace function public.aegis_normalize_operation_link()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_metric text;
  v_mission public.missions%rowtype;
  v_category text := initcap(lower(coalesce(new.category, '')));
  v_book_title text;
  v_is_daily_reading boolean := lower(trim(coalesce(new.title, ''))) = 'read one chapter';
  v_operation_text text := lower(coalesce(new.title, '') || ' ' || coalesce(new.brief, ''));
begin
  v_metric := public.aegis_infer_operation_metric(new.title, new.metric_key);

  if v_category in ('Mind', 'Body', 'Mastery') or v_category = '' then v_category := 'Self Mastery'; end if;
  if v_operation_text ~ '(dentist|lunch|errand|grocery|tax|bill|commute)'
    or (v_operation_text ~ 'appointment' and v_operation_text !~ '(physical therapy|orthopedic|acl|rehab|recovery|pt)') then
    v_category := 'Life Admin';
  end if;
  if v_category not in ('Recovery', 'Trading', 'Business', 'Self Mastery', 'Life Admin') then
    v_category := 'Self Mastery';
  end if;

  -- This is the only intentional escape hatch. The UI must persist it; a
  -- missing mission_id by itself is never treated as permission to orphan an
  -- operation.
  if coalesce(new.allow_unlinked, false) or v_category = 'Life Admin' then
    new.mission_id := null;
  elsif v_is_daily_reading then
    -- An explicit mission selected in the editor is authoritative. Only
    -- infer the active book when this operation was created without a link.
    if new.mission_id is not null then
      select * into v_mission
      from public.missions m
      where m.id = new.mission_id
        and m.user_id = new.user_id
        and m.completed is false;
      if not found then
        new.mission_id := null;
        v_mission := null;
      end if;
    end if;

    if v_mission.id is null then
      select me.title into v_book_title
      from public.mastery_entries me
      where me.user_id = new.user_id
        and lower(coalesce(me.category, '')) = 'book'
      order by me.created_at desc nulls last, me.id desc
      limit 1;
    end if;

    if v_mission.id is null and nullif(trim(v_book_title), '') is not null then
      select * into v_mission
      from public.missions m
      where m.user_id = new.user_id
        and m.completed is false
        and public.aegis_operation_metric_matches(m.metric_key, 'chapters_read')
      order by m.created_at desc nulls last, m.id desc
      limit 1;
    end if;
  else
    -- Preserve an explicit valid link unless it points at a finished mission
    -- and the operation is still open.
    if new.mission_id is not null then
      select * into v_mission
      from public.missions m
      where m.id = new.mission_id and m.user_id = new.user_id;
      if not found then new.mission_id := null; end if;
      if v_mission.id is not null and v_mission.completed is true and new.completed is not true then
        new.mission_id := null;
        v_mission := null;
      end if;
    end if;

    -- First use the operation's measurable metric, then its language, then
    -- its department. This keeps PT, reading, gym, trading, and future
    -- measurable operations on the correct mission whenever evidence exists.
    if v_mission.id is null and v_metric is not null then
      select * into v_mission
      from public.missions m
      where m.user_id = new.user_id
        and (m.completed is false or new.completed is true)
        and public.aegis_operation_metric_matches(m.metric_key, v_metric)
      order by (m.completed = true), m.created_at desc nulls last, m.id desc
      limit 1;
    end if;
    if v_mission.id is null then
      select * into v_mission
      from public.missions m
      where m.user_id = new.user_id
        and (m.completed is false or new.completed is true)
        and (
          (v_operation_text ~ '(physical therapy|\mpt\M|orthopedic|acl|rehab)' and lower(coalesce(m.title, '') || ' ' || coalesce(m.completion_definition, '')) ~ '(orthopedic|recovery|pt|rehab|session)')
          or (v_operation_text ~ '(gym|workout|strength|resistance)' and lower(coalesce(m.title, '') || ' ' || coalesce(m.completion_definition, '')) ~ '(training|gym|strength|workout|performance)')
          or (v_operation_text ~ '(trade|trading|pre-market|chart|backtest|risk)' and lower(coalesce(m.title, '') || ' ' || coalesce(m.completion_definition, '')) ~ '(trade|trading|playbook|review|execution|risk)')
          or (v_operation_text ~ '(read|book|chapter)' and lower(coalesce(m.title, '') || ' ' || coalesce(m.completion_definition, '')) ~ '(book|chapter|learning)')
        )
      order by (m.completed = true), m.created_at desc nulls last, m.id desc
      limit 1;
    end if;
    -- The user's default is that an operation belongs somewhere. If no
    -- specialized match exists, keep it visible in the mission system by
    -- assigning the newest active mission in the same department, then the
    -- newest active mission overall.
    if v_mission.id is null then
      select * into v_mission
      from public.missions m
      where m.user_id = new.user_id
        and (m.completed is false or new.completed is true)
        and lower(coalesce(m.category, '')) = lower(v_category)
      order by m.created_at desc nulls last, m.id desc
      limit 1;
    end if;
    if v_mission.id is null then
      select * into v_mission
      from public.missions m
      where m.user_id = new.user_id and (m.completed is false or new.completed is true)
      order by m.created_at desc nulls last, m.id desc
      limit 1;
    end if;
  end if;

  if v_mission.id is not null then
    new.mission_id := v_mission.id;
    if v_category <> 'Life Admin' then
      v_category := initcap(lower(coalesce(v_mission.category, v_category)));
    end if;
  end if;

  -- Missions created by older versions can still carry Mind/Body labels.
  -- Never copy those legacy labels back onto operations after linking.
  if v_category in ('Mind', 'Body', 'Mastery') or v_category = '' then
    v_category := 'Self Mastery';
  end if;
  if v_category not in ('Recovery', 'Trading', 'Business', 'Self Mastery', 'Life Admin') then
    v_category := 'Self Mastery';
  end if;
  new.category := v_category;
  new.metric_key := coalesce(v_metric, new.metric_key);
  return new;
end $$;

drop trigger if exists aegis_normalize_operation_link on public.operations;
create trigger aegis_normalize_operation_link
before insert or update of title, category, mission_id, metric_key, completed, allow_unlinked on public.operations
for each row execute function public.aegis_normalize_operation_link();

-- The explicit id predicate makes the intentional full-row repair visible to
-- Supabase's safety checker. It replays the universal rule without changing
-- status, schedule, or any user-entered operation fields.
update public.operations
set title = title
where id is not null;

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.operations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format(
      'alter table public.operations drop constraint if exists %I',
      constraint_row.conname
    );
  end loop;
end $$;

alter table public.operations
  add constraint operations_category_check
  check (category in ('Recovery', 'Trading', 'Business', 'Self Mastery', 'Life Admin'));

grant execute on function public.aegis_normalize_operation_link() to authenticated;
