-- AEGIS 064 — durable missed operation status and manual corrections.
-- Run once in the Supabase SQL Editor.

-- Automatic end-of-day reconciliation writes Missed, while this flag keeps a
-- deliberate user correction (for example, changing an old item back to
-- Queued or Complete) from being immediately reclassified on the next sync.
alter table public.operations
  add column if not exists status_override boolean not null default false;

alter table public.operation_occurrences
  add column if not exists status_override boolean not null default false;

alter table public.operations
  drop constraint if exists operations_status_check;

alter table public.operations
  add constraint operations_status_check
  check (status in ('Queued', 'Scheduled', 'Ongoing', 'Complete', 'Missed'));

alter table public.operation_occurrences
  drop constraint if exists operation_occurrences_status_check;

alter table public.operation_occurrences
  add constraint operation_occurrences_status_check
  check (status in ('Queued', 'Scheduled', 'Ongoing', 'Complete', 'Missed'));

