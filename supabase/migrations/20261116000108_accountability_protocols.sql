-- AEGIS 108 - durable correction protocols for the five-year campaign.
-- This adds an append-only accountability record. It does not alter or
-- reinterpret historical operations, missions, or XP.

create table if not exists public.accountability_protocols (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  severity text not null check (severity in ('moderate', 'major', 'critical')),
  trigger_type text not null check (trigger_type in ('weekly_execution', 'inactivity')),
  trigger_date date not null,
  execution_rate numeric(5,2),
  summary text not null check (char_length(summary) between 1 and 600),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'completed')),
  reason text check (reason is null or char_length(reason) between 20 and 2000),
  make_up_task text check (make_up_task is null or char_length(make_up_task) between 10 and 500),
  make_up_operation_id uuid references public.operations(id) on delete set null,
  acknowledged_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'open' and reason is null and make_up_task is null and acknowledged_at is null)
    or (status in ('acknowledged', 'completed') and reason is not null and make_up_task is not null and acknowledged_at is not null)
  )
);

create index if not exists accountability_protocols_user_status_created_idx
  on public.accountability_protocols (user_id, status, created_at desc);

alter table public.accountability_protocols enable row level security;

create policy "Accountability protocols are private"
on public.accountability_protocols for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update on public.accountability_protocols to authenticated;
