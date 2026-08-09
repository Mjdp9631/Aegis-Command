-- AEGIS COMMAND — Missions and Recovery
-- Run once in Supabase SQL Editor after the original schema.

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  category text not null check (category in ('Recovery', 'Trading', 'Business', 'Mind')),
  priority text not null default 'Strategic' check (priority in ('Non-negotiable', 'High', 'Strategic')),
  progress integer not null default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.recovery_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  logged_on date not null default current_date,
  pain integer not null check (pain between 0 and 10),
  swelling integer not null check (swelling between 0 and 10),
  rehab_completed boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.missions enable row level security;
alter table public.recovery_logs enable row level security;

drop policy if exists "Missions are private" on public.missions;
create policy "Missions are private" on public.missions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Recovery logs are private" on public.recovery_logs;
create policy "Recovery logs are private" on public.recovery_logs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index if not exists missions_user_created_idx on public.missions (user_id, created_at desc);
create index if not exists recovery_logs_user_date_idx on public.recovery_logs (user_id, logged_on desc);
