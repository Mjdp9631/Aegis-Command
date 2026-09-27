-- AEGIS 100 - manual, month-by-month financial history.
-- Run once in the Supabase SQL Editor after migration 099.

create table if not exists public.financial_monthly_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month_start date not null,
  monthly_income numeric not null default 0 check (monthly_income >= 0),
  monthly_expenses numeric not null default 0 check (monthly_expenses >= 0),
  liquid_reserves numeric not null default 0 check (liquid_reserves >= 0),
  emergency_fund_target numeric not null default 0 check (emergency_fund_target >= 0),
  debt_balance numeric not null default 0 check (debt_balance >= 0),
  business_revenue numeric not null default 0 check (business_revenue >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_monthly_snapshots_month_start_check
    check (date_trunc('month', month_start::timestamp)::date = month_start),
  unique (user_id, month_start)
);

create index if not exists financial_monthly_snapshots_user_month_idx
  on public.financial_monthly_snapshots (user_id, month_start desc);

alter table public.financial_monthly_snapshots enable row level security;

drop policy if exists "Financial monthly snapshots are private" on public.financial_monthly_snapshots;
create policy "Financial monthly snapshots are private"
  on public.financial_monthly_snapshots for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.financial_monthly_snapshots to authenticated;
