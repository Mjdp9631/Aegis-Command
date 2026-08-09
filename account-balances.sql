-- AEGIS COMMAND — account balances
-- Run once in Supabase SQL Editor.

create table if not exists public.account_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_name text not null check (char_length(account_name) between 1 and 80),
  starting_balance numeric(14,2) not null check (starting_balance > 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, account_name)
);

alter table public.account_balances enable row level security;

drop policy if exists "Account balances are private" on public.account_balances;
create policy "Account balances are private"
on public.account_balances for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create index if not exists account_balances_user_idx
on public.account_balances (user_id, is_primary desc, created_at asc);
