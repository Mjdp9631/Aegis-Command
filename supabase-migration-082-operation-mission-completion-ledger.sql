-- AEGIS 082 — durable, reversible mission credit per operation completion.
-- Run once in the Supabase SQL editor after deploying the matching app code.

create table if not exists public.operation_mission_completion_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id uuid not null references public.missions(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  occurrence_id uuid references public.operation_occurrences(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- A one-time operation can credit each linked mission once. A recurring
-- occurrence can likewise credit each linked mission once, independently of
-- the parent operation's other occurrences.
create unique index if not exists operation_mission_completion_one_time_unique
  on public.operation_mission_completion_ledger (user_id, mission_id, operation_id)
  where occurrence_id is null;
create unique index if not exists operation_mission_completion_occurrence_unique
  on public.operation_mission_completion_ledger (user_id, mission_id, occurrence_id)
  where occurrence_id is not null;
create index if not exists operation_mission_completion_lookup_idx
  on public.operation_mission_completion_ledger (user_id, operation_id, occurrence_id);

alter table public.operation_mission_completion_ledger enable row level security;
drop policy if exists "operation mission completion ledger private" on public.operation_mission_completion_ledger;
create policy "operation mission completion ledger private"
  on public.operation_mission_completion_ledger
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.operation_mission_completion_ledger to authenticated;
grant all privileges on public.operation_mission_completion_ledger to service_role;
