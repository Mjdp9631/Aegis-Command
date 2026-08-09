-- AEGIS 056 — theoretical account testing ledger and earned-total controls.
-- Run after migration 054/055 in Supabase SQL Editor.

alter table public.account_balances
  drop constraint if exists account_balances_account_type_check;

alter table public.account_balances
  add constraint account_balances_account_type_check
  check (account_type in ('Live', 'Prop Firm', 'Theoretical'));

alter table public.account_groups
  drop constraint if exists account_groups_account_type_check,
  drop constraint if exists account_groups_check,
  drop constraint if exists account_groups_profit_split_check;

alter table public.account_groups
  add constraint account_groups_account_type_check
  check (account_type in ('Live', 'Prop Firm', 'Theoretical')),
  add constraint account_groups_profit_split_check
  check (
    (account_type in ('Live', 'Theoretical') and (profit_split_percent is null or profit_split_percent between 0 and 100))
    or (account_type = 'Prop Firm' and profit_split_percent between 0 and 100)
  );

alter table public.account_group_withdrawals
  add column if not exists include_in_total_earned boolean not null default true;

update public.account_group_withdrawals withdrawal
set include_in_total_earned = false
from public.account_groups account_group
where account_group.id = withdrawal.group_id
  and account_group.account_type = 'Theoretical';

create table if not exists public.account_test_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null references public.account_balances(id) on delete cascade,
  traded_at timestamptz not null default now(),
  strategy text,
  pnl_usd numeric(14,2) not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_test_trades enable row level security;

drop policy if exists "Account test trades are private" on public.account_test_trades;
create policy "Account test trades are private" on public.account_test_trades
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists account_test_trades_account_date_idx
  on public.account_test_trades (account_id, traded_at desc);

create or replace function public.validate_account_test_trade_account()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from public.account_balances
    where id = new.account_id and user_id = new.user_id and account_type = 'Theoretical'
  ) then
    raise exception 'Testing trades require a Theoretical account';
  end if;
  return new;
end;
$$;

drop trigger if exists account_test_trade_account_guard on public.account_test_trades;
create trigger account_test_trade_account_guard
  before insert or update on public.account_test_trades
  for each row execute function public.validate_account_test_trade_account();

grant select, insert, update, delete on public.account_test_trades to authenticated;
grant all privileges on public.account_test_trades to service_role;
grant execute on function public.validate_account_test_trade_account() to authenticated;
