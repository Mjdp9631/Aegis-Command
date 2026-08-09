-- AEGIS COMMAND — private data layer. Run once in Supabase SQL Editor.
create table if not exists public.operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  category text not null check (category in ('Recovery', 'Trading', 'Business', 'Mind')),
  completed boolean not null default false,
  scheduled_date date not null default current_date,
  created_at timestamptz not null default now()
);
create table if not exists public.trade_debriefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pair text not null check (char_length(pair) between 1 and 24),
  r_multiple numeric not null check (r_multiple between -100 and 100),
  setup text,
  execution_grade text not null check (execution_grade in ('A', 'B', 'C', 'D')),
  traded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.operations enable row level security;
alter table public.trade_debriefs enable row level security;
drop policy if exists "Operations are private" on public.operations;
create policy "Operations are private" on public.operations for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Trade debriefs are private" on public.trade_debriefs;
create policy "Trade debriefs are private" on public.trade_debriefs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index if not exists operations_user_date_idx on public.operations (user_id, scheduled_date);
create index if not exists trade_debriefs_user_traded_at_idx on public.trade_debriefs (user_id, traded_at desc);
