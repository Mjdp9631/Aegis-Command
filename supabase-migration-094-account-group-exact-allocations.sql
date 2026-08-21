-- AEGIS 094 — exact per-account allocations for grouped trades and withdrawals.
-- Run this once in the Supabase SQL Editor before using the updated Account tab.

create table if not exists public.account_group_trade_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_trade_link_id uuid not null references public.account_group_trade_links(id) on delete cascade,
  account_id uuid not null references public.account_balances(id) on delete cascade,
  pnl_usd numeric(14,2) not null,
  created_at timestamptz not null default now(),
  unique (group_trade_link_id, account_id)
);

create index if not exists account_group_trade_allocations_account_idx
  on public.account_group_trade_allocations (account_id, created_at desc);

create index if not exists account_group_trade_allocations_link_idx
  on public.account_group_trade_allocations (group_trade_link_id);

-- Preserve every legacy link exactly as it behaved: its old amount was a
-- per-account amount, so every account that belonged to the group when the
-- link was created receives that same amount.
insert into public.account_group_trade_allocations (user_id, group_trade_link_id, account_id, pnl_usd)
select link.user_id, link.id, membership.account_id, link.actual_pnl_usd
from public.account_group_trade_links link
join public.account_group_memberships membership
  on membership.group_id = link.group_id
 and membership.joined_at <= link.created_at
 and (membership.left_at is null or membership.left_at > link.created_at)
on conflict (group_trade_link_id, account_id) do nothing;

-- The link now stores the group total; allocations remain the source of truth
-- for each account's balance.
update public.account_group_trade_links link
set actual_pnl_usd = totals.pnl_total,
    updated_at = now()
from (
  select group_trade_link_id, sum(pnl_usd)::numeric(14,2) as pnl_total
  from public.account_group_trade_allocations
  group by group_trade_link_id
) totals
where totals.group_trade_link_id = link.id;

create or replace function public.validate_account_group_trade_allocation()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1
    from public.account_group_trade_links link
    join public.account_group_memberships membership
      on membership.group_id = link.group_id
     and membership.account_id = new.account_id
     and membership.joined_at <= link.created_at
     and (membership.left_at is null or membership.left_at > link.created_at)
    where link.id = new.group_trade_link_id
      and link.user_id = new.user_id
  ) then
    raise exception 'Trade allocations must belong to an account in the linked group';
  end if;
  return new;
end;
$$;

drop trigger if exists account_group_trade_allocation_guard on public.account_group_trade_allocations;
create trigger account_group_trade_allocation_guard
  before insert or update on public.account_group_trade_allocations
  for each row execute function public.validate_account_group_trade_allocation();

alter table public.account_group_trade_allocations enable row level security;

drop policy if exists "Group trade allocations are private" on public.account_group_trade_allocations;
create policy "Group trade allocations are private" on public.account_group_trade_allocations
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.account_group_trade_allocations to authenticated;
grant execute on function public.validate_account_group_trade_allocation() to authenticated;
