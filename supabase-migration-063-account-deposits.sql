-- AEGIS 063 — account deposits are balance funding, not profit.

create table if not exists public.account_deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null references public.account_balances(id) on delete cascade,
  amount_usd numeric(14,2) not null check (amount_usd > 0),
  deposited_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists account_deposits_account_date_idx
  on public.account_deposits (account_id, deposited_at desc);

alter table public.account_deposits enable row level security;
drop policy if exists "Account deposits are private" on public.account_deposits;
create policy "Account deposits are private" on public.account_deposits
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.account_deposits to authenticated;
grant all privileges on public.account_deposits to service_role;
