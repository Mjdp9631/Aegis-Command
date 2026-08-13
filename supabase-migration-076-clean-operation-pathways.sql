-- AEGIS 076 — clean operation-family pathways
--
-- This migration intentionally resets only pathway metadata. It preserves
-- operations, operation occurrences, journal/recovery/body logs, and the
-- mission counters already shown to the user. The old relationship rows are
-- copied to checkpoint tables before they are cleared.
--
-- Run once in Supabase SQL Editor after the base operations/mission tables.
-- This migration bootstraps the relationship tables itself so it can be run
-- safely even when migration 075 was skipped. Do not run 075 first merely to
-- satisfy the old dependency: 075 clears legacy pathways before this
-- migration can archive them.

create table if not exists public.operation_mission_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  mission_id uuid not null references public.missions(id) on delete cascade,
  is_explicit boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (operation_id, mission_id)
);

create table if not exists public.operation_family_mission_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_family_key text not null,
  mission_id uuid not null references public.missions(id) on delete cascade,
  is_explicit boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_family_key, mission_id)
);

create index if not exists operation_mission_links_mission_idx
  on public.operation_mission_links (mission_id, created_at desc);
create index if not exists operation_family_mission_links_mission_idx
  on public.operation_family_mission_links (mission_id, created_at desc);

alter table public.operation_mission_links enable row level security;
alter table public.operation_family_mission_links enable row level security;
drop policy if exists "operation mission links private" on public.operation_mission_links;
create policy "operation mission links private"
  on public.operation_mission_links for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "operation family mission links private" on public.operation_family_mission_links;
create policy "operation family mission links private"
  on public.operation_family_mission_links for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.operation_mission_links, public.operation_family_mission_links to authenticated;
grant all privileges on public.operation_mission_links, public.operation_family_mission_links to service_role;

alter table public.operations
  add column if not exists operation_family_key text,
  add column if not exists allow_unlinked boolean not null default false,
  add column if not exists mission_increment integer not null default 1;

alter table public.mission_progress_events
  add column if not exists occurrence_id uuid references public.operation_occurrences(id) on delete cascade,
  add column if not exists activity_event_id uuid references public.activity_events(id) on delete cascade;

create table if not exists public.aegis_checkpoint_operation_family_links
(like public.operation_family_mission_links including all);

create table if not exists public.aegis_checkpoint_operation_links
(like public.operation_mission_links including all);

create table if not exists public.aegis_clean_pathway_migration
(
  id boolean primary key default true check (id),
  applied_at timestamptz not null default now()
);

-- A stable family key is derived from the operation's meaning, not its date.
-- A title such as "Read one chapter" therefore has one family across every
-- scheduled date, while "Gym - Push" and "Gym - Pull" remain distinct.
create or replace function public.aegis_clean_operation_family_key(
  p_title text,
  p_category text
)
returns text
language sql
immutable
as $$
  select trim(both '-' from lower(regexp_replace(
    regexp_replace(
      regexp_replace(
        trim(coalesce(p_title, 'operation')),
        '\m20[0-9]{2}[-/]?[0-9]{2}[-/]?[0-9]{2}\M', '', 'g'
      ),
      '\m(session|sessions|chapter|chapters)[[:space:]]*#?[[:space:]]*[0-9]+\M', '', 'gi'
    ) || '-' || coalesce(nullif(trim(p_category), ''), 'Self Mastery'),
    '[^a-zA-Z0-9]+', '-', 'g'
  )));
$$;

-- Disable every previous automatic pathway trigger before normalizing rows.
drop trigger if exists aegis_normalize_operation_family on public.operations;
drop trigger if exists aegis_normalize_operation_link on public.operations;
drop trigger if exists aegis_operation_progress on public.operations;
drop trigger if exists aegis_operation_mission_links on public.operations;
drop trigger if exists aegis_operation_family_progress on public.operations;
drop trigger if exists aegis_occurrence_progress on public.operation_occurrences;
drop trigger if exists aegis_link_progress on public.operation_mission_links;
drop trigger if exists aegis_family_link_progress on public.operation_family_mission_links;
drop trigger if exists aegis_clean_operation_progress on public.operations;
drop trigger if exists aegis_clean_occurrence_progress on public.operation_occurrences;
drop trigger if exists aegis_clean_family_link_progress on public.operation_family_mission_links;

do $$
begin
  if not exists (select 1 from public.aegis_clean_pathway_migration where id) then
    -- Preserve the old relationships for audit/recovery. These are metadata
    -- snapshots only; no user-entered operation or log row is removed.
    insert into public.aegis_checkpoint_operation_family_links
      (user_id, operation_family_key, mission_id, is_explicit, created_at)
    select user_id, operation_family_key, mission_id, is_explicit, created_at
    from public.operation_family_mission_links
    on conflict do nothing;

    insert into public.aegis_checkpoint_operation_links
      (user_id, operation_id, mission_id, is_explicit, created_at)
    select user_id, operation_id, mission_id, is_explicit, created_at
    from public.operation_mission_links
    on conflict do nothing;

    -- Recompute the family key for every existing row, including rows that
    -- still contain the old placeholder value "operation".
    update public.operations
    set operation_family_key = public.aegis_clean_operation_family_key(title, category)
    where id is not null;

    -- Remove only pathway metadata and derived operation evidence. Raw
    -- operations/occurrences remain intact. Existing mission counters remain
    -- intact until the user explicitly attaches a clean pathway.
    delete from public.operation_family_mission_links;
    delete from public.operation_mission_links;
    update public.operations
    set mission_id = null
    where id is not null and mission_id is not null;
    delete from public.mission_progress_events
    where operation_id is not null or occurrence_id is not null;

    insert into public.aegis_clean_pathway_migration (id)
    values (true)
    on conflict (id) do nothing;
  end if;
end $$;

alter table public.operations
  alter column operation_family_key drop default;

create or replace function public.aegis_clean_normalize_operation_family()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Legacy mission_id is deliberately not a pathway anymore. The explicit
  -- family-link table is the only source of mission advancement.
  new.mission_id := null;
  new.operation_family_key := public.aegis_clean_operation_family_key(new.title, new.category);
  return new;
end;
$$;

create trigger aegis_normalize_operation_family
before insert or update of title, category, operation_family_key, mission_id
on public.operations
for each row execute function public.aegis_clean_normalize_operation_family();

-- The previous versions used several automatic operation/matching triggers.
-- Remove them so creating or completing an operation never guesses a mission.
-- Rebuild derived mission evidence from exactly one source per completed
-- unit: a completed one-time parent operation, or a completed occurrence for
-- a recurring operation. Queued, ongoing, scheduled, and missed rows count 0.
create or replace function public.aegis_clean_reconcile_mission(
  p_user_id uuid,
  p_mission_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mission_count integer;
  v_target integer;
  v_completed boolean;
begin
  if p_user_id is null or p_mission_id is null then
    return;
  end if;

  -- Rebuilding the operation-derived rows makes the result idempotent and
  -- prevents a repeated trigger from awarding duplicate progress. All linked
  -- families are included, so attaching a second family never erases the
  -- first family's contribution.
  delete from public.mission_progress_events
  where user_id = p_user_id
    and mission_id = p_mission_id
    and (operation_id is not null or occurrence_id is not null);

  insert into public.mission_progress_events (user_id, mission_id, operation_id, amount)
  select o.user_id, p_mission_id, o.id, greatest(1, coalesce(o.mission_increment, 1))
  from public.operations o
  where o.user_id = p_user_id
    and o.completed is true
    and exists (
      select 1 from public.operation_family_mission_links l
      where l.user_id = p_user_id
        and l.mission_id = p_mission_id
        and l.operation_family_key = o.operation_family_key
    )
    and not exists (
      select 1 from public.operation_occurrences oo
      where oo.operation_id = o.id
    )
  on conflict do nothing;

  insert into public.mission_progress_events (user_id, mission_id, operation_id, occurrence_id, amount)
  select oo.user_id, p_mission_id, oo.operation_id, oo.id, 1
  from public.operation_occurrences oo
  join public.operations o on o.id = oo.operation_id and o.user_id = oo.user_id
  where oo.user_id = p_user_id
    and oo.completed is true
    and exists (
      select 1 from public.operation_family_mission_links l
      where l.user_id = p_user_id
        and l.mission_id = p_mission_id
        and l.operation_family_key = o.operation_family_key
    )
  on conflict do nothing;

  select
    least(coalesce(m.target_count, 1), count(e.id)::integer),
    coalesce(m.target_count, 1)
  into v_mission_count, v_target
  from public.missions m
  left join public.mission_progress_events e
    on e.mission_id = m.id
   and e.user_id = p_user_id
   and (e.operation_id is not null or e.occurrence_id is not null)
  where m.id = p_mission_id
    and m.user_id = p_user_id
  group by m.target_count;

  if v_target is null then
    return;
  end if;

  v_completed := v_mission_count >= v_target;
  update public.missions
  set completed_count = v_mission_count,
      completed = v_completed,
      progress = case when v_target > 0 then round((v_mission_count::numeric / v_target::numeric) * 100)::integer else 0 end
  where id = p_mission_id
    and user_id = p_user_id;

  -- Reaching the measured target closes every pathway for this mission.
  -- Historical evidence remains; only future advancement is detached.
  if v_completed then
    delete from public.operation_family_mission_links
    where user_id = p_user_id and mission_id = p_mission_id;
  end if;
end;
$$;

create or replace function public.aegis_clean_reconcile_operation_family(
  p_user_id uuid,
  p_family_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mission_id uuid;
begin
  if p_user_id is null or nullif(trim(p_family_key), '') is null then
    return;
  end if;
  for v_mission_id in
    select mission_id
    from public.operation_family_mission_links
    where user_id = p_user_id and operation_family_key = p_family_key
  loop
    perform public.aegis_clean_reconcile_mission(p_user_id, v_mission_id);
  end loop;
end;
$$;

create or replace function public.aegis_clean_operation_progress_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.aegis_clean_reconcile_operation_family(
      old.user_id,
      public.aegis_clean_operation_family_key(old.title, old.category)
    );
    return old;
  end if;

  perform public.aegis_clean_reconcile_operation_family(new.user_id, new.operation_family_key);
  if tg_op = 'UPDATE' and old.operation_family_key is distinct from new.operation_family_key then
    perform public.aegis_clean_reconcile_operation_family(old.user_id, old.operation_family_key);
  end if;
  return new;
end;
$$;

create or replace function public.aegis_clean_occurrence_progress_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family text;
begin
  select operation_family_key into v_family
  from public.operations
  where id = case when tg_op = 'DELETE' then old.operation_id else new.operation_id end
    and user_id = case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  perform public.aegis_clean_reconcile_operation_family(
    case when tg_op = 'DELETE' then old.user_id else new.user_id end,
    v_family
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.aegis_clean_family_link_progress_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    -- Unlinking intentionally leaves historical evidence untouched.
    return old;
  end if;
  perform public.aegis_clean_reconcile_operation_family(new.user_id, new.operation_family_key);
  return new;
end;
$$;

create trigger aegis_clean_operation_progress
after insert or update of title, category, completed, status, operation_family_key, mission_increment, allow_unlinked
on public.operations
for each row execute function public.aegis_clean_operation_progress_trigger();

create trigger aegis_clean_occurrence_progress
after insert or update of operation_id, completed, status, occurrence_date
on public.operation_occurrences
for each row execute function public.aegis_clean_occurrence_progress_trigger();

drop trigger if exists aegis_clean_family_link_progress on public.operation_family_mission_links;
create trigger aegis_clean_family_link_progress
after insert or update or delete on public.operation_family_mission_links
for each row execute function public.aegis_clean_family_link_progress_trigger();

create index if not exists operations_user_family_idx
  on public.operations (user_id, operation_family_key);

grant execute on function public.aegis_clean_operation_family_key(text, text) to authenticated;
grant execute on function public.aegis_clean_reconcile_mission(uuid, uuid) to authenticated;
grant execute on function public.aegis_clean_reconcile_operation_family(uuid, text) to authenticated;
