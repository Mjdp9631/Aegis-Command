-- AEGIS 072 — one universal operation -> mission rule.
-- Run once after migration 071 in the Supabase SQL editor.
-- Every non-Life-Admin operation is assigned to an active mission unless
-- allow_unlinked is explicitly true. Life Admin remains unlinked by default.

alter table public.operations
  add column if not exists allow_unlinked boolean not null default false;

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
    -- The standing reading operation follows the active book mission.
    select me.title into v_book_title
    from public.mastery_entries me
    where me.user_id = new.user_id
      and lower(coalesce(me.category, '')) = 'book'
    order by me.created_at desc nulls last, me.id desc
    limit 1;

    if nullif(trim(v_book_title), '') is not null then
      select * into v_mission
      from public.missions m
      where m.user_id = new.user_id
        and m.completed is false
        and public.aegis_operation_metric_matches(m.metric_key, 'chapters_read')
        and regexp_replace(lower(coalesce(m.title, '') || ' ' || coalesce(m.completion_definition, '')), '[^a-z0-9]+', '', 'g')
          like '%' || regexp_replace(lower(v_book_title), '[^a-z0-9]+', '', 'g') || '%'
      order by m.created_at desc nulls last, m.id desc
      limit 1;
    end if;
    if v_mission.id is null then
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
  new.category := v_category;
  new.metric_key := coalesce(v_metric, new.metric_key);
  return new;
end $$;

drop trigger if exists aegis_normalize_operation_link on public.operations;
create trigger aegis_normalize_operation_link
before insert or update of title, category, mission_id, metric_key, completed, allow_unlinked on public.operations
for each row execute function public.aegis_normalize_operation_link();

-- Repair every existing row through the same rule without changing status or
-- schedule. Life Admin rows remain intentionally independent.
update public.operations set title = title where true;

grant execute on function public.aegis_normalize_operation_link() to authenticated;
