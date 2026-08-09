-- AEGIS 043 — recurring operation end dates and daily/weekly repeats.
-- Run once in Supabase SQL Editor before using Daily/Weekly repeats.

-- Make this migration self-contained for projects that were created before
-- the original scheduling migration.  The later constraints and updates
-- below depend on these columns existing.
alter table public.operations
  add column if not exists scheduled_date date,
  add column if not exists scheduled_time time,
  add column if not exists schedule_mode text not null default 'one_time',
  add column if not exists scheduled_end_date date;

-- Migration 040 allowed only one_time/recurring.  The UI stores weekly as
-- recurring and uses daily as a distinct cadence, so replace any older
-- schedule_mode check without depending on its generated constraint name.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.operations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%schedule_mode%'
  loop
    execute format(
      'alter table public.operations drop constraint if exists %I',
      constraint_row.conname
    );
  end loop;
end $$;

-- Older deployments may still contain the UI label `weekly`.
update public.operations
set schedule_mode = 'recurring'
where schedule_mode = 'weekly';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.operations'::regclass
      and conname = 'operations_schedule_mode_check'
  ) then
    alter table public.operations
      add constraint operations_schedule_mode_check
      check (schedule_mode in ('one_time', 'recurring', 'daily'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.operations'::regclass
      and conname = 'operations_schedule_end_after_start'
  ) then
    alter table public.operations
      add constraint operations_schedule_end_after_start
      check (
        scheduled_end_date is null
        or scheduled_date is null
        or scheduled_end_date >= scheduled_date
      );
  end if;
end $$;
