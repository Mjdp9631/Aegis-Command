-- AEGIS 071 — every non-Life-Admin operation advances a mission.
-- Run once after migration 070. Life Admin remains intentionally unlinked.

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

  if v_category in ('Mind', 'Body', 'Mastery') or v_category = '' then v_category := 'Self Mastery'; end if;
  if lower(coalesce(new.title, '')) ~ '(dentist|doctor appointment|appointment|lunch|errand|grocery|tax|bill|commute)' then
    v_category := 'Life Admin';
  end if;
  if v_category not in ('Recovery', 'Trading', 'Business', 'Self Mastery', 'Life Admin') then
    v_category := 'Self Mastery';
  end if;

  if v_category = 'Life Admin' then
    new.mission_id := null;
  elsif v_is_daily_reading then
    -- The standing reading operation follows only the active book and never
    -- falls back to another book or a completed book mission.
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
      if v_mission.id is not null and v_mission.completed is true and new.completed is not true then
        new.mission_id := null;
        v_mission := null;
      end if;
    end if;

    if v_mission.id is null then
      select * into v_mission
      from public.missions m
      where m.user_id = new.user_id
        and (m.completed is false or new.completed is true)
        and (
          (v_metric is not null and public.aegis_operation_metric_matches(m.metric_key, v_metric))
          or lower(coalesce(m.category, '')) = lower(v_category)
        )
      order by (m.completed = true), m.created_at desc nulls last, m.id desc
      limit 1;
    end if;

    -- If there is no category-specific mission, still keep the operation in
    -- the mission system rather than silently dropping its evidence.
    if v_mission.id is null then
      select * into v_mission
      from public.missions m
      where m.user_id = new.user_id
        and (m.completed is false or new.completed is true)
      order by (m.completed = true), m.created_at desc nulls last, m.id desc
      limit 1;
    end if;
    if v_mission.id is not null then new.mission_id := v_mission.id; end if;
  end if;

  if v_mission.id is not null and v_category <> 'Life Admin' then
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

-- Re-run normalization for existing rows without changing their status/date.
update public.operations set title = title where true;

grant execute on function public.aegis_normalize_operation_link() to authenticated;
