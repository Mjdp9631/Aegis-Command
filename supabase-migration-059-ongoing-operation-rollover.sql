-- AEGIS 059 — durable multi-day operation rollover.
-- Run once in the Supabase SQL Editor.

-- An ongoing operation keeps its original start, records each 5 AM rollover,
-- and remains visible on the current operating day until it is completed.
alter table public.operations
  add column if not exists started_on date,
  add column if not exists last_rollover_on date,
  add column if not exists rollover_count integer not null default 0;

alter table public.operation_occurrences
  add column if not exists started_on date,
  add column if not exists last_rollover_on date,
  add column if not exists rollover_count integer not null default 0;

create index if not exists operations_ongoing_rollover_idx
  on public.operations (user_id, status, last_rollover_on);
create index if not exists operation_occurrences_ongoing_rollover_idx
  on public.operation_occurrences (user_id, status, last_rollover_on);
