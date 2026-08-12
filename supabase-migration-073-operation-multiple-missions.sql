-- AEGIS 073 — operations may advance multiple missions.
-- Run after migration 072 in the Supabase SQL editor.
-- The legacy operations.mission_id remains as the primary link for older
-- clients. operation_mission_links is the durable many-to-many relationship.

create table if not exists public.operation_mission_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  mission_id uuid not null references public.missions(id) on delete cascade,
  is_explicit boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (operation_id, mission_id)
);

create index if not exists operation_mission_links_mission_idx
  on public.operation_mission_links (mission_id, created_at desc);

alter table public.mission_progress_events
  add column if not exists occurrence_id uuid references public.operation_occurrences(id) on delete cascade,
  add column if not exists activity_event_id uuid references public.activity_events(id) on delete cascade;

alter table public.operation_mission_links enable row level security;
drop policy if exists "operation mission links private" on public.operation_mission_links;
create policy "operation mission links private"
  on public.operation_mission_links
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.operation_mission_links to authenticated;
grant all privileges on public.operation_mission_links to service_role;

-- Preserve every existing primary operation link.
insert into public.operation_mission_links (user_id, operation_id, mission_id, is_explicit)
select user_id, id, mission_id, true
from public.operations
where mission_id is not null
on conflict (operation_id, mission_id) do update
set is_explicit = true;

-- The original progress table allowed only one mission per operation. Replace
-- that uniqueness rule with one event per operation/mission pair. Occurrence
-- events remain independently unique through their occurrence_id index.
drop index if exists mission_progress_activity_unique;
create unique index if not exists mission_progress_activity_mission_unique
  on public.mission_progress_events (activity_event_id, mission_id)
  where activity_event_id is not null;

drop index if exists mission_progress_occurrence_unique;
create unique index if not exists mission_progress_occurrence_unique
  on public.mission_progress_events (occurrence_id, mission_id)
  where occurrence_id is not null;

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.mission_progress_events'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%operation_id%'
  loop
    execute format(
      'alter table public.mission_progress_events drop constraint if exists %I',
      constraint_row.conname
    );
  end loop;
end $$;

create unique index if not exists mission_progress_operation_mission_unique
  on public.mission_progress_events (operation_id, mission_id)
  where occurrence_id is null;

create or replace function public.aegis_reconcile_operation_progress(p_operation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_operation public.operations%rowtype;
  v_event record;
  v_inserted uuid;
begin
  select * into v_operation
  from public.operations
  where id = p_operation_id;
  if not found then return; end if;

  -- Remove parent evidence that is no longer valid because the operation was
  -- reopened or a mission link was removed.
  for v_event in
    select e.id, e.mission_id, e.amount
    from public.mission_progress_events e
    where e.operation_id = p_operation_id
      and e.occurrence_id is null
      and (not coalesce(v_operation.completed, false)
        or not exists (
          select 1
          from public.operation_mission_links l
          where l.operation_id = p_operation_id
            and l.mission_id = e.mission_id
        ))
  loop
    update public.missions
    set completed_count = greatest(0, coalesce(completed_count, 0) - greatest(1, coalesce(v_event.amount, 1))),
        completed = greatest(0, coalesce(completed_count, 0) - greatest(1, coalesce(v_event.amount, 1))) >= coalesce(target_count, 1)
    where id = v_event.mission_id and user_id = v_operation.user_id;
    delete from public.mission_progress_events where id = v_event.id;
  end loop;

  if coalesce(v_operation.completed, false) then
    for v_event in
      select l.mission_id
      from public.operation_mission_links l
      where l.operation_id = p_operation_id
        and l.user_id = v_operation.user_id
    loop
      v_inserted := null;
    insert into public.mission_progress_events (user_id, mission_id, operation_id, amount)
      values (v_operation.user_id, v_event.mission_id, p_operation_id, greatest(1, coalesce(v_operation.mission_increment, 1)))
      on conflict (operation_id, mission_id) where occurrence_id is null do nothing
      returning id into v_inserted;
      if v_inserted is not null then
        update public.missions
        set completed_count = least(coalesce(target_count, 1), coalesce(completed_count, 0) + greatest(1, coalesce(v_operation.mission_increment, 1))),
            completed = coalesce(completed_count, 0) + greatest(1, coalesce(v_operation.mission_increment, 1)) >= coalesce(target_count, 1)
        where id = v_event.mission_id and user_id = v_operation.user_id;
      end if;
    end loop;
    insert into public.activity_events(user_id, source_type, source_id, metric_key, occurred_at, metadata)
    values (v_operation.user_id, 'operations', p_operation_id, coalesce(v_operation.metric_key, 'operation.complete'), now(),
      jsonb_build_object('title', v_operation.title, 'category', v_operation.category,
        'mission_ids', coalesce((select jsonb_agg(mission_id) from public.operation_mission_links where operation_id = p_operation_id), '[]'::jsonb)))
    on conflict (source_type, source_id) do update
      set metric_key = excluded.metric_key, metadata = excluded.metadata;
  else
    delete from public.activity_events where source_type = 'operations' and source_id = p_operation_id;
  end if;
end $$;

create or replace function public.aegis_reconcile_occurrence_progress(p_occurrence_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_occurrence public.operation_occurrences%rowtype;
  v_operation public.operations%rowtype;
  v_event record;
  v_activity uuid;
  v_inserted uuid;
begin
  select * into v_occurrence from public.operation_occurrences where id = p_occurrence_id;
  if not found then return; end if;
  select * into v_operation from public.operations where id = v_occurrence.operation_id and user_id = v_occurrence.user_id;
  if not found then return; end if;

  for v_event in
    select e.id, e.mission_id, e.amount
    from public.mission_progress_events e
    where e.occurrence_id = p_occurrence_id
      and (not coalesce(v_occurrence.completed, false)
        or not exists (
          select 1 from public.operation_mission_links l
          where l.operation_id = v_operation.id and l.mission_id = e.mission_id
        ))
  loop
    update public.missions
    set completed_count = greatest(0, coalesce(completed_count, 0) - greatest(1, coalesce(v_event.amount, 1))),
        completed = greatest(0, coalesce(completed_count, 0) - greatest(1, coalesce(v_event.amount, 1))) >= coalesce(target_count, 1)
    where id = v_event.mission_id and user_id = v_occurrence.user_id;
    delete from public.mission_progress_events where id = v_event.id;
  end loop;

  if not coalesce(v_occurrence.completed, false) then
    delete from public.activity_events where source_type = 'operation_occurrences' and source_id = p_occurrence_id;
    return;
  end if;

  insert into public.activity_events(user_id, source_type, source_id, metric_key, occurred_at, metadata)
  values (v_occurrence.user_id, 'operation_occurrences', p_occurrence_id, coalesce(v_operation.metric_key, 'operation.complete'), now(),
    jsonb_build_object('title', v_operation.title, 'category', v_operation.category, 'occurrence_date', v_occurrence.occurrence_date))
  on conflict (source_type, source_id) do update
    set metric_key = excluded.metric_key, metadata = excluded.metadata
  returning id into v_activity;
  if v_activity is null then
    select id into v_activity from public.activity_events where source_type = 'operation_occurrences' and source_id = p_occurrence_id;
  end if;

  for v_event in
    select l.mission_id
    from public.operation_mission_links l
    where l.operation_id = v_operation.id and l.user_id = v_occurrence.user_id
  loop
    v_inserted := null;
    insert into public.mission_progress_events (user_id, mission_id, occurrence_id, activity_event_id, amount)
    values (v_occurrence.user_id, v_event.mission_id, p_occurrence_id, v_activity, 1)
    on conflict (occurrence_id, mission_id) where occurrence_id is not null do nothing
    returning id into v_inserted;
    if v_inserted is not null then
      update public.missions
      set completed_count = least(coalesce(target_count, 1), coalesce(completed_count, 0) + 1),
          completed = coalesce(completed_count, 0) + 1 >= coalesce(target_count, 1)
      where id = v_event.mission_id and user_id = v_occurrence.user_id;
    end if;
  end loop;
end $$;

create or replace function public.aegis_sync_operation_mission_links()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_category text := initcap(lower(coalesce(new.category, '')));
  v_metric text := public.aegis_infer_operation_metric(new.title, new.metric_key);
  v_operation_text text := lower(coalesce(new.title, '') || ' ' || coalesce(new.brief, ''));
  v_is_daily_reading boolean := lower(trim(coalesce(new.title, ''))) = 'read one chapter';
  v_mission uuid;
begin
  if coalesce(new.allow_unlinked, false) or v_category = 'Life Admin' then
    delete from public.operation_mission_links where operation_id = new.id;
    perform public.aegis_reconcile_operation_progress(new.id);
    return new;
  end if;

  -- Keep links explicitly chosen in the UI. Rebuild only inferred links so a
  -- new category/title cannot erase a deliberate second mission assignment.
  if not coalesce(new.completed, false) then
    delete from public.operation_mission_links
    where operation_id = new.id and is_explicit is false;
  end if;

  if new.mission_id is not null then
    insert into public.operation_mission_links (user_id, operation_id, mission_id, is_explicit)
    values (new.user_id, new.id, new.mission_id, true)
    on conflict (operation_id, mission_id) do update set is_explicit = true;
  end if;

  if not v_is_daily_reading then
    insert into public.operation_mission_links (user_id, operation_id, mission_id, is_explicit)
    select new.user_id, new.id, m.id, false
    from public.missions m
    where m.user_id = new.user_id
      and m.completed is false
      and (
        (v_metric is not null and public.aegis_operation_metric_matches(m.metric_key, v_metric))
        or (v_operation_text ~ '(physical therapy|\mpt\M|orthopedic|acl|rehab)' and lower(coalesce(m.title, '') || ' ' || coalesce(m.completion_definition, '')) ~ '(orthopedic|recovery|pt|rehab|session)')
        or (v_operation_text ~ '(gym|workout|strength|resistance)' and lower(coalesce(m.title, '') || ' ' || coalesce(m.completion_definition, '')) ~ '(training|gym|strength|workout|performance)')
        or (v_operation_text ~ '(trade|trading|pre-market|chart|backtest|risk)' and lower(coalesce(m.title, '') || ' ' || coalesce(m.completion_definition, '')) ~ '(trade|trading|playbook|review|execution|risk)')
        or (v_operation_text ~ '(read|book|chapter)' and lower(coalesce(m.title, '') || ' ' || coalesce(m.completion_definition, '')) ~ '(book|chapter|learning)')
        or lower(coalesce(m.category, '')) = lower(v_category)
      )
    on conflict (operation_id, mission_id) do nothing;
  end if;

  if not v_is_daily_reading and not exists (select 1 from public.operation_mission_links where operation_id = new.id) then
    select m.id into v_mission
    from public.missions m
    where m.user_id = new.user_id and m.completed is false
    order by m.created_at desc nulls last, m.id desc
    limit 1;
    if v_mission is not null then
      insert into public.operation_mission_links (user_id, operation_id, mission_id, is_explicit)
      values (new.user_id, new.id, v_mission, false)
      on conflict (operation_id, mission_id) do nothing;
    end if;
  end if;

  perform public.aegis_reconcile_operation_progress(new.id);
  for v_mission in select id from public.operation_occurrences where operation_id = new.id and completed is true loop
    perform public.aegis_reconcile_occurrence_progress(v_mission);
  end loop;
  return new;
end $$;

create or replace function public.aegis_sync_operation_progress()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.aegis_reconcile_operation_progress(new.id);
  return new;
end $$;

create or replace function public.aegis_sync_link_progress()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_operation_id uuid;
  v_occurrence_id uuid;
  v_user_id uuid;
  v_mission_id uuid;
begin
  v_operation_id := case when tg_op = 'DELETE' then old.operation_id else new.operation_id end;
  v_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  v_mission_id := case when tg_op = 'DELETE' then old.mission_id else new.mission_id end;
  if not exists (
    select 1 from public.operations
    where id = v_operation_id and user_id = v_user_id
  ) or not exists (
    select 1 from public.missions
    where id = v_mission_id and user_id = v_user_id
  ) then
    raise exception 'Operation and mission must belong to the same user';
  end if;
  perform public.aegis_reconcile_operation_progress(v_operation_id);
  for v_occurrence_id in
    select id from public.operation_occurrences
    where operation_id = v_operation_id and completed is true
  loop
    perform public.aegis_reconcile_occurrence_progress(v_occurrence_id);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create or replace function public.aegis_sync_occurrence_progress()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.aegis_reconcile_occurrence_progress(case when tg_op = 'DELETE' then old.id else new.id end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists aegis_operation_progress on public.operations;
create trigger aegis_operation_progress
after insert or update on public.operations
for each row execute function public.aegis_sync_operation_progress();

drop trigger if exists aegis_operation_mission_links on public.operations;
create trigger aegis_operation_mission_links
after insert or update of title, category, mission_id, metric_key, completed, allow_unlinked on public.operations
for each row execute function public.aegis_sync_operation_mission_links();

drop trigger if exists aegis_link_progress on public.operation_mission_links;
create trigger aegis_link_progress
after insert or update or delete on public.operation_mission_links
for each row execute function public.aegis_sync_link_progress();

drop trigger if exists aegis_occurrence_progress on public.operation_occurrences;
create trigger aegis_occurrence_progress
after insert or update on public.operation_occurrences
for each row execute function public.aegis_sync_occurrence_progress();

-- Rebuild durable links and completion evidence for existing rows.
update public.operations set mission_id = mission_id where id is not null;
update public.operation_occurrences set completed = completed where id is not null;

grant execute on function public.aegis_reconcile_operation_progress(uuid) to authenticated;
grant execute on function public.aegis_reconcile_occurrence_progress(uuid) to authenticated;
grant execute on function public.aegis_sync_operation_mission_links() to authenticated;
