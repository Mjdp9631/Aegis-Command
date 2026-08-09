-- A recurring operation is a series; each scheduled date needs its own state.
-- This prevents completing Monday's instance from completing Wednesday's one.
create table if not exists public.operation_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  occurrence_date date not null,
  scheduled_time time,
  status text not null default 'Scheduled'
    check (status in ('Queued', 'Scheduled', 'Ongoing', 'Complete')),
  completed boolean not null default false,
  completed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation_id, occurrence_date)
);

alter table public.operation_occurrences enable row level security;

drop policy if exists "Operation occurrences are private" on public.operation_occurrences;
create policy "Operation occurrences are private"
  on public.operation_occurrences
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists operation_occurrences_user_date_idx
  on public.operation_occurrences (user_id, occurrence_date);
create index if not exists operation_occurrences_operation_date_idx
  on public.operation_occurrences (operation_id, occurrence_date);
