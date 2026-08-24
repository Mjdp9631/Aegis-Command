-- AEGIS 101 — one lot-size execution per account on each journal trade.

create table if not exists public.trade_account_executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trade_debrief_id uuid not null references public.trade_debriefs(id) on delete cascade,
  account_id uuid not null references public.account_balances(id) on delete cascade,
  lot_size numeric not null check (lot_size > 0),
  created_at timestamptz not null default now(),
  unique (trade_debrief_id, account_id)
);

create index if not exists trade_account_executions_trade_idx
  on public.trade_account_executions (trade_debrief_id, created_at);

create index if not exists trade_account_executions_account_idx
  on public.trade_account_executions (account_id, created_at desc);

-- Preserve legacy logs where their text account name still maps to a current
-- Account tab record. New journal entries use this table exclusively.
insert into public.trade_account_executions (user_id, trade_debrief_id, account_id, lot_size)
select trade.user_id, trade.id, account.id, trade.lot_size
from public.trade_debriefs trade
join public.account_balances account
  on account.user_id = trade.user_id
 and lower(account.account_name) = lower(trade.account)
where trade.lot_size is not null
  and trade.lot_size > 0
on conflict (trade_debrief_id, account_id) do nothing;

alter table public.trade_account_executions enable row level security;

drop policy if exists "Trade account executions are private" on public.trade_account_executions;
create policy "Trade account executions are private" on public.trade_account_executions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.trade_account_executions to authenticated;
