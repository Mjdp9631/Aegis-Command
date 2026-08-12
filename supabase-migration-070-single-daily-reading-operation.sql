-- AEGIS 070 — one daily reading operation follows the active book.
-- Run once in Supabase SQL Editor after migration 069.
-- The daily "Read one chapter" row is the only reading operation. It links to
-- the current book mission while that mission is incomplete, then becomes
-- unlinked after the final completed chapter until a new book is active.

create or replace function public.aegis_normalize_operation_link()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_metric text;
  v_mission public.missions%rowtype;
  v_category text := initcap(lower(coalesce(new.category, '')));
  v_book_title text;
  v_is_daily_reading boolean := lower(trim(coalesce(new.title, ''))) = 'read one chapter';
begin
  v_metric := public.aegis_infer_operation_metric(new.title, new.metric_key);

  if v_is_daily_reading then
    -- Do not honor a stale mission_id and do not fall back to another book.
    -- The latest Book entry is the active book for this standing operation.
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

    new.mission_id := case when v_mission.id is null then null else v_mission.id end;
  else
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
          or (lower(coalesce(new.title, '')) ~ '(trade|trading|pre-market|chart|backtest)' and lower(coalesce(m.title, '') || ' ' || coalesce(m.completion_definition, '')) ~ '(trade|trading|playbook|review)')
        )
      order by (m.completed = true), m.created_at asc
      limit 1;
    end if;
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

-- Remove only the generated final-chapter rows from the superseded design.
delete from public.operations
where lower(coalesce(title, '')) ~ '^read one chapter.*chapter[[:space:]]+[0-9]+$';

-- Re-resolve existing daily reading rows through the new trigger.
update public.operations
set title = title
where lower(trim(coalesce(title, ''))) = 'read one chapter';

grant execute on function public.aegis_normalize_operation_link() to authenticated;
