-- AEGIS fitness, health, and timed-operation evidence.
-- This migration deliberately does not touch XP, campaign ledgers, or existing progress.

alter table public.operations add column if not exists scheduled_time time;
alter table public.operations add column if not exists operation_date date;
alter table public.operations add column if not exists is_daily boolean not null default false;

alter table public.training_sessions add column if not exists workout_split text;

create table if not exists public.training_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  exercise_name text not null,
  weight_lbs numeric,
  reps integer,
  sets integer not null default 1,
  logged_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.health_weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  measured_at text not null check (measured_at in ('AM', 'PM')),
  weight_lbs numeric not null check (weight_lbs > 0),
  logged_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.health_food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  food_name text not null,
  calories numeric,
  fat_g numeric,
  protein_g numeric,
  fiber_g numeric,
  sugar_g numeric,
  notes text,
  logged_on date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.training_sets enable row level security;
alter table public.health_weight_logs enable row level security;
alter table public.health_food_logs enable row level security;

drop policy if exists "Training sets are private" on public.training_sets;
create policy "Training sets are private" on public.training_sets for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Health weight logs are private" on public.health_weight_logs;
create policy "Health weight logs are private" on public.health_weight_logs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Health food logs are private" on public.health_food_logs;
create policy "Health food logs are private" on public.health_food_logs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index if not exists training_sets_user_logged_idx on public.training_sets (user_id, logged_on desc);
create index if not exists health_weight_logs_user_logged_idx on public.health_weight_logs (user_id, logged_on desc);
create index if not exists health_food_logs_user_logged_idx on public.health_food_logs (user_id, logged_on desc);
