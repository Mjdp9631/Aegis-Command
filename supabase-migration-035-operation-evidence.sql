-- AEGIS: make operations durable evidence for measurable missions.
-- Run once in Supabase SQL Editor before using the linked-operation system.

alter table public.operations
  add column if not exists completed_on date,
  add column if not exists mission_id uuid references public.missions(id) on delete set null,
  add column if not exists mission_increment integer not null default 1 check (mission_increment > 0),
  add column if not exists mission_incremented boolean not null default false;

create index if not exists operations_user_completed_on_idx
  on public.operations (user_id, completed_on desc);

-- Existing completed operations should remain historical, not suddenly award
-- mission progress. Only future status changes create new evidence.
update public.operations
set completed_on = coalesce(completed_on, case when completed then current_date else null end)
where completed_on is null and completed is true;
