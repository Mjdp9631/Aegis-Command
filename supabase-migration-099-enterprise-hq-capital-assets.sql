-- AEGIS 099 — Enterprise HQ capital ledger and owned-asset register.
-- Run once in the Supabase SQL Editor.

create table if not exists public.business_capital_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null default current_date,
  entry_type text not null check (entry_type in ('Account earning', 'Capital added', 'Expense', 'Capital withdrawal')),
  title text not null check (char_length(title) between 1 and 160),
  amount_usd numeric(14,2) not null check (amount_usd > 0),
  account_id uuid references public.account_balances(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.business_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  acquired_on date not null default current_date,
  asset_type text not null check (asset_type in ('Crypto', 'Business asset', 'Equity', 'Cash', 'Other')),
  title text not null check (char_length(title) between 1 and 160),
  symbol text,
  quantity numeric(20,8) check (quantity is null or quantity >= 0),
  cost_basis_usd numeric(14,2) check (cost_basis_usd is null or cost_basis_usd >= 0),
  current_value_usd numeric(14,2) check (current_value_usd is null or current_value_usd >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_capital_entries_user_date_idx on public.business_capital_entries (user_id, entry_date desc, created_at desc);
create index if not exists business_assets_user_type_idx on public.business_assets (user_id, asset_type, acquired_on desc);

alter table public.business_capital_entries enable row level security;
alter table public.business_assets enable row level security;

drop policy if exists "Business capital entries are private" on public.business_capital_entries;
create policy "Business capital entries are private" on public.business_capital_entries for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Business assets are private" on public.business_assets;
create policy "Business assets are private" on public.business_assets for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.business_capital_entries, public.business_assets to authenticated;
