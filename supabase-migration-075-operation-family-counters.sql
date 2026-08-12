-- AEGIS 075 — one operation family can produce many measured completions.
-- Run after migration 074.
-- Calendar occurrences remain date-level records for status/history, but the
-- mission pathway is stored once against the operation family.

alter table public.operations
  add column if not exists operation_family_key text;

-- The family key is metadata only; it is not a mission assignment.

update public.operations
set operation_family_key = trim(both '-' from lower(regexp_replace(
  regexp_replace(
    regexp_replace(trim(coalesce(title, 'operation')), '\m20[0-9]{2}[-/]?[0-9]{2}[-/]?[0-9]{2}\M', '', 'g'),
    '\m(session|sessions|chapter|chapters)[[:space:]]*#?[[:space:]]*[0-9]+\M', '', 'gi'
  ) || '-' || coalesce(category, 'Self Mastery'),
  '[^a-zA-Z0-9]+', '-', 'g'
)))
where nullif(trim(operation_family_key), '') is null;

update public.operations
set operation_family_key = trim(both '-' from operation_family_key)
where operation_family_key is not null;

-- Migration 070/071 left a before trigger that guesses mission_id values.
-- Family links replace that behavior; keep categories/metrics, but never let
-- the retired trigger assign a mission behind the user's back.
drop trigger if exists aegis_normalize_operation_link on public.operations;

alter table public.operations
  alter column operation_family_key set default 'operation';

create index if not exists operations_user_family_idx
  on public.operations (user_id, operation_family_key);

create table if not exists public.operation_family_mission_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_family_key text not null,
  mission_id uuid not null references public.missions(id) on delete cascade,
  is_explicit boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_family_key, mission_id)
);

alter table public.operation_family_mission_links enable row level security;
drop policy if exists "operation family mission links private" on public.operation_family_mission_links;
create policy "operation family mission links private"
  on public.operation_family_mission_links
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.operation_family_mission_links to authenticated;
grant all privileges on public.operation_family_mission_links to service_role;

-- Earlier migrations populated both the legacy mission_id and the old
-- operation_mission_links table automatically. Do not reinterpret those rows
-- as deliberate user choices. Clear only those pathways; operation rows,
-- occurrence history, logs, and missions remain intact for manual relinking.
delete from public.operation_mission_links;
update public.operations set mission_id = null where mission_id is not null;

create or replace function public.aegis_reconcile_operation_progress(p_operation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_operation public.operations%rowtype;
  v_event record;
  v_inserted uuid;
  v_family text;
begin
  select * into v_operation from public.operations where id = p_operation_id;
  if not found then return; end if;
  v_family := coalesce(nullif(trim(v_operation.operation_family_key), ''), 'operation');

  for v_event in
    select e.id, e.mission_id, e.amount
    from public.mission_progress_events e
    where e.operation_id = p_operation_id
      and e.occurrence_id is null
      and (not coalesce(v_operation.completed, false)
        or not exists (
          select 1 from public.operation_family_mission_links l
          where l.user_id = v_operation.user_id
            and l.operation_family_key = v_family
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
      from public.operation_family_mission_links l
      where l.user_id = v_operation.user_id and l.operation_family_key = v_family
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
  else
    delete from public.activity_events where source_type = 'operations' and source_id = p_operation_id;
  end if;
end $$;

create or replace function public.aegis_normalize_operation_family()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if nullif(trim(new.operation_family_key), '') is null or trim(new.operation_family_key) = 'operation' then
    new.operation_family_key := trim(both '-' from lower(regexp_replace(
      regexp_replace(
        regexp_replace(trim(coalesce(new.title, 'operation')), '\m20[0-9]{2}[-/]?[0-9]{2}[-/]?[0-9]{2}\M', '', 'g'),
        '\m(session|sessions|chapter|chapters)[[:space:]]*#?[[:space:]]*[0-9]+\M', '', 'gi'
      ) || '-' || coalesce(new.category, 'Self Mastery'),
      '[^a-zA-Z0-9]+', '-', 'g'
    )));
  end if;
  return new;
end $$;

drop trigger if exists aegis_normalize_operation_family on public.operations;
create trigger aegis_normalize_operation_family
before insert or update of title, category, operation_family_key on public.operations
for each row execute function public.aegis_normalize_operation_family();

create or replace function public.aegis_sync_operation_mission_links()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_family text := coalesce(nullif(trim(new.operation_family_key), ''), 'operation');
begin
  if coalesce(new.allow_unlinked, false)
    or lower(trim(coalesce(new.category, ''))) in ('life admin', 'day to day') then
    delete from public.operation_family_mission_links
    where user_id = new.user_id and operation_family_key = v_family;
    perform public.aegis_reconcile_operation_progress(new.id);
    return new;
  end if;

  perform public.aegis_reconcile_operation_progress(new.id);
  return new;
end $$;

-- Progress is keyed by operation family and occurrence date. Existing rows
-- remain valid; future recurring completions use one family pathway and add a
-- new occurrence event for each completed date.
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
          select 1 from public.operation_family_mission_links l
          where l.user_id = v_operation.user_id
            and l.operation_family_key = coalesce(nullif(trim(v_operation.operation_family_key), ''), 'operation')
            and l.mission_id = e.mission_id
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
    jsonb_build_object('title', v_operation.title, 'category', v_operation.category, 'operation_family_key', v_operation.operation_family_key, 'occurrence_date', v_occurrence.occurrence_date))
  on conflict (source_type, source_id) do update set metric_key = excluded.metric_key, metadata = excluded.metadata
  returning id into v_activity;
  if v_activity is null then
    select id into v_activity from public.activity_events where source_type = 'operation_occurrences' and source_id = p_occurrence_id;
  end if;

  for v_event in
    select l.mission_id
    from public.operation_family_mission_links l
    where l.user_id = v_operation.user_id
      and l.operation_family_key = coalesce(nullif(trim(v_operation.operation_family_key), ''), 'operation')
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

create or replace function public.aegis_sync_family_link_progress()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_operation_id uuid;
  v_occurrence_id uuid;
  v_family text;
  v_user_id uuid;
begin
  v_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  v_family := case when tg_op = 'DELETE' then old.operation_family_key else new.operation_family_key end;
  for v_operation_id in
    select id from public.operations where user_id = v_user_id and operation_family_key = v_family
  loop
    perform public.aegis_reconcile_operation_progress(v_operation_id);
    for v_occurrence_id in select id from public.operation_occurrences where operation_id = v_operation_id and completed is true loop
      perform public.aegis_reconcile_occurrence_progress(v_occurrence_id);
    end loop;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- Rebuild each completed occurrence against the family pathway so historical
-- PT/chapter/gym completions are counted once per occurrence, not once per
-- operation row plus occurrence row.
do $$
declare
  v_occurrence uuid;
begin
  for v_occurrence in select id from public.operation_occurrences where completed is true loop
    perform public.aegis_reconcile_occurrence_progress(v_occurrence);
  end loop;
end $$;

drop trigger if exists aegis_operation_mission_links on public.operations;
create trigger aegis_operation_mission_links
after insert or update of title, category, mission_id, metric_key, completed, allow_unlinked, operation_family_key on public.operations
for each row execute function public.aegis_sync_operation_mission_links();

drop trigger if exists aegis_family_link_progress on public.operation_family_mission_links;
create trigger aegis_family_link_progress
after insert or update or delete on public.operation_family_mission_links
for each row execute function public.aegis_sync_family_link_progress();

-- Populate each family's metadata without changing status or dates.
update public.operations set operation_family_key = operation_family_key where id is not null;

grant execute on function public.aegis_reconcile_occurrence_progress(uuid) to authenticated;
grant execute on function public.aegis_sync_operation_mission_links() to authenticated;
