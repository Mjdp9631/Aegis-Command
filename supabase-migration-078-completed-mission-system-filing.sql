-- AEGIS 078 — file completed missions into the aligned XP system.
--
-- A mission remains in public.missions and in the Completed mission ledger.
-- When it reaches completed=true, this creates one durable system record:
--   * book missions -> Self Mastery / Book
--   * Business missions -> Business / Special Projects
--   * other missions -> the closest existing Self Mastery subcategory
--
-- The source marker and unique indexes make this idempotent. Repeated scans,
-- refreshes, and cross-browser updates cannot create duplicate XP evidence.

alter table public.mastery_entries
  add column if not exists source_mission_id uuid references public.missions(id) on delete set null;

alter table public.business_projects
  add column if not exists source_mission_id uuid references public.missions(id) on delete set null;

-- Keep the category vocabulary used by the current Self Mastery UI available
-- to both manual entries and mission-generated evidence.
alter table public.mastery_entries
  drop constraint if exists mastery_entries_category_check;

alter table public.mastery_entries
  add constraint mastery_entries_category_check
  check (category in (
    'Book', 'Quote', 'Trading Note', 'Psychology', 'Space', 'Philosophy',
    'Business', 'Stoicism', 'Leadership', 'Communication', 'History',
    'Systems Thinking', 'Health', 'Gym', 'Mobility', 'Performance', 'Sports',
    'Outdoor Skills'
  ));

create unique index if not exists mastery_entries_user_source_mission_idx
  on public.mastery_entries (user_id, source_mission_id)
  where source_mission_id is not null;

create unique index if not exists business_projects_user_source_mission_idx
  on public.business_projects (user_id, source_mission_id)
  where source_mission_id is not null;

create or replace function public.aegis_file_completed_mission(p_mission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mission public.missions%rowtype;
  v_text text;
  v_book_title text;
  v_mastery_category text;
  v_priority text;
  v_logged_on date;
begin
  select * into v_mission
  from public.missions
  where id = p_mission_id;

  if not found or not coalesce(v_mission.completed, false) then
    return;
  end if;

  v_text := lower(concat_ws(' ',
    coalesce(v_mission.title, ''),
    coalesce(v_mission.completion_definition, ''),
    coalesce(v_mission.unit_label, ''),
    coalesce(v_mission.metric_key, '')
  ));
  v_logged_on := coalesce((v_mission.completed_at at time zone 'America/New_York')::date,
    (now() at time zone 'America/New_York')::date);

  -- A specific reading mission is a Book entry. The generic daily operation
  -- “Read one chapter” is not itself a book and therefore is not filed here.
  if (
    v_text ~ '\m(book|chapter|reading)\M'
    or lower(coalesce(v_mission.metric_key, '')) = 'chapters_read'
  ) and lower(trim(v_mission.title)) not in ('read one chapter', 'reading one chapter') then
    v_book_title := regexp_replace(trim(v_mission.title), '^(read|reading)\s+', '', 'i');
    v_book_title := regexp_replace(v_book_title, '^book\s*[:\-]?\s*', '', 'i');
    v_book_title := replace(replace(v_book_title, '“', ''), '”', '');
    v_book_title := btrim(v_book_title, ' ''"');
    if nullif(v_book_title, '') is null then v_book_title := v_mission.title; end if;

    insert into public.mastery_entries (
      user_id, category, title, summary, key_lessons, action_items,
      logged_on, source_mission_id
    ) values (
      v_mission.user_id, 'Book', v_book_title,
      coalesce(v_mission.completion_definition, 'Completed the reading mission.'),
      'Completed mission: ' || v_mission.title,
      'Mission completed on ' || v_logged_on::text || '.',
      v_logged_on, v_mission.id
    )
    on conflict (user_id, source_mission_id) where source_mission_id is not null
    do update set
      title = excluded.title,
      summary = excluded.summary,
      key_lessons = excluded.key_lessons,
      action_items = excluded.action_items,
      logged_on = excluded.logged_on;
    return;
  end if;

  -- Business completion belongs in the existing Special Projects surface.
  -- Marking it Complete lets the existing Business XP calculation award the
  -- normal project-start and project-completion evidence exactly once.
  if lower(coalesce(v_mission.category, '')) = 'business' then
    v_priority := case lower(coalesce(v_mission.priority, ''))
      when 'do now' then 'Do now'
      when 'delegate' then 'Delegate'
      when 'eliminate' then 'Eliminate'
      else 'Schedule'
    end;

    insert into public.business_projects (
      user_id, title, status, priority, project_type, progress, outcome,
      next_action, logged_on, source_mission_id
    ) values (
      v_mission.user_id, v_mission.title, 'Complete', v_priority,
      'Mission completion', 100,
      coalesce(v_mission.completion_definition, 'Completed mission.'),
      null, v_logged_on, v_mission.id
    )
    on conflict (user_id, source_mission_id) where source_mission_id is not null
    do update set
      title = excluded.title,
      status = 'Complete',
      priority = excluded.priority,
      progress = 100,
      outcome = excluded.outcome,
      logged_on = excluded.logged_on;
    return;
  end if;

  -- For non-book, non-Business missions, file evidence in the closest
  -- existing Self Mastery category rather than fabricating a trade or health
  -- log. Those logs require domain-specific facts that a mission alone does
  -- not contain.
  v_mastery_category := case
    when lower(coalesce(v_mission.category, '')) = 'trading'
      or v_text ~ '\m(trade|trading|chart|market|risk)\M' then 'Trading Note'
    when v_text ~ '\m(psychology|behavior|mindset|cognitive)\M' then 'Psychology'
    when v_text ~ '\m(space|astronomy|physics|science)\M' then 'Space'
    when v_text ~ '\m(history|historical)\M' then 'History'
    when v_text ~ '\m(leadership|leader)\M' then 'Leadership'
    when v_text ~ '\m(communication|communicate)\M' then 'Communication'
    when v_text ~ '\m(system|baseline|process|protocol)\M' then 'Systems Thinking'
    when v_text ~ '\m(philosophy|stoic|stoicism|discipline|journal|morning)\M' then 'Stoicism'
    when lower(coalesce(v_mission.category, '')) = 'recovery' then 'Health'
    else 'Stoicism'
  end;

  insert into public.mastery_entries (
    user_id, category, title, summary, key_lessons, action_items,
    logged_on, source_mission_id
  ) values (
    v_mission.user_id, v_mastery_category, v_mission.title,
    coalesce(v_mission.completion_definition, 'Completed mission.'),
    'Completed mission: ' || v_mission.title,
    'Mission completed on ' || v_logged_on::text || '.',
    v_logged_on, v_mission.id
  )
  on conflict (user_id, source_mission_id) where source_mission_id is not null
  do update set
    title = excluded.title,
    summary = excluded.summary,
    key_lessons = excluded.key_lessons,
    action_items = excluded.action_items,
    logged_on = excluded.logged_on;
end;
$$;

create or replace function public.aegis_file_completed_mission_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.aegis_file_completed_mission(new.id);
  return new;
end;
$$;

drop trigger if exists aegis_file_completed_mission on public.missions;
create trigger aegis_file_completed_mission
after insert or update of completed, title, category, priority, completion_definition, metric_key, completed_at
on public.missions
for each row execute function public.aegis_file_completed_mission_trigger();

-- Backfill already-completed missions, including missions completed before
-- this migration. The source marker makes this safe to run more than once.
do $$
declare
  v_mission_id uuid;
begin
  for v_mission_id in select id from public.missions where completed is true loop
    perform public.aegis_file_completed_mission(v_mission_id);
  end loop;
end;
$$;

grant execute on function public.aegis_file_completed_mission(uuid) to authenticated;
grant execute on function public.aegis_file_completed_mission_trigger() to authenticated;
