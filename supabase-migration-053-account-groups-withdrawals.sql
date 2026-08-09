-- AEGIS COMMAND — grouped accounts, trade allocations, and withdrawal ledger.

alter table public.account_balances
  add column if not exists account_type text not null default 'Live';

alter table public.account_balances
  drop constraint if exists account_balances_account_type_check;

alter table public.account_balances
  add constraint account_balances_account_type_check
  check (account_type in ('Live', 'Prop Firm'));

create table if not exists public.account_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  account_type text not null check (account_type in ('Live', 'Prop Firm')),
  profit_split_percent numeric(5,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  check ((account_type = 'Live' and (profit_split_percent is null or profit_split_percent = 100)) or (account_type = 'Prop Firm' and profit_split_percent between 0 and 100))
);

create table if not exists public.account_group_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null references public.account_balances(id) on delete cascade,
  group_id uuid not null references public.account_groups(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  check (left_at is null or left_at > joined_at)
);

create unique index if not exists account_group_one_current_membership_idx on public.account_group_memberships (account_id) where left_at is null;
create index if not exists account_group_memberships_group_time_idx on public.account_group_memberships (group_id, joined_at, left_at);

create table if not exists public.account_group_trade_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id uuid not null references public.account_groups(id) on delete cascade,
  trade_id uuid not null references public.trade_debriefs(id) on delete cascade,
  actual_pnl_usd numeric(14,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, trade_id)
);

create table if not exists public.account_group_withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id uuid not null references public.account_groups(id) on delete cascade,
  withdrawn_at timestamptz not null default now(),
  gross_amount_per_account_usd numeric(14,2) not null check (gross_amount_per_account_usd > 0),
  payout_amount_per_account_usd numeric(14,2) not null check (payout_amount_per_account_usd >= 0),
  gross_total_usd numeric(14,2) not null check (gross_total_usd > 0),
  payout_total_usd numeric(14,2) not null check (payout_total_usd >= 0),
  profit_split_percent numeric(5,2) not null check (profit_split_percent between 0 and 100),
  account_count integer not null check (account_count > 0),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.account_group_withdrawal_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  withdrawal_id uuid not null references public.account_group_withdrawals(id) on delete cascade,
  account_id uuid not null references public.account_balances(id) on delete cascade,
  gross_deduction_usd numeric(14,2) not null check (gross_deduction_usd > 0),
  payout_amount_usd numeric(14,2) not null check (payout_amount_usd >= 0),
  created_at timestamptz not null default now(),
  unique (withdrawal_id, account_id)
);

create index if not exists account_group_trade_links_group_idx on public.account_group_trade_links (group_id, created_at desc);
create index if not exists account_group_withdrawals_group_date_idx on public.account_group_withdrawals (group_id, withdrawn_at desc);
create index if not exists account_group_withdrawal_allocations_account_idx on public.account_group_withdrawal_allocations (account_id, created_at desc);

create or replace function public.validate_account_group_type()
returns trigger language plpgsql as $$
declare account_kind text; group_kind text;
begin
  select account_type into account_kind from public.account_balances where id = new.account_id and user_id = new.user_id;
  select account_type into group_kind from public.account_groups where id = new.group_id and user_id = new.user_id;
  if account_kind is null or group_kind is null or account_kind <> group_kind then raise exception 'Account and group types must match'; end if;
  return new;
end;
$$;

drop trigger if exists account_group_membership_type_guard on public.account_group_memberships;
create trigger account_group_membership_type_guard before insert or update on public.account_group_memberships for each row execute function public.validate_account_group_type();

create or replace function public.prevent_account_type_change_with_membership()
returns trigger language plpgsql as $$
begin
  if new.account_type <> old.account_type and exists (
    select 1 from public.account_group_memberships membership
    join public.account_groups account_group on account_group.id = membership.group_id
    where membership.account_id = old.id and membership.left_at is null and account_group.account_type <> new.account_type
  ) then raise exception 'Account type must match its current group'; end if;
  return new;
end;
$$;

drop trigger if exists account_type_membership_guard on public.account_balances;
create trigger account_type_membership_guard before update on public.account_balances for each row execute function public.prevent_account_type_change_with_membership();

create or replace function public.prevent_group_type_change_with_membership()
returns trigger language plpgsql as $$
begin
  if new.account_type <> old.account_type and exists (
    select 1 from public.account_group_memberships membership
    join public.account_balances account_balance on account_balance.id = membership.account_id
    where membership.group_id = old.id and membership.left_at is null and account_balance.account_type <> new.account_type
  ) then raise exception 'Group type must match its current accounts'; end if;
  return new;
end;
$$;

drop trigger if exists group_type_membership_guard on public.account_groups;
create trigger group_type_membership_guard before update on public.account_groups for each row execute function public.prevent_group_type_change_with_membership();

alter table public.account_groups enable row level security;
alter table public.account_group_memberships enable row level security;
alter table public.account_group_trade_links enable row level security;
alter table public.account_group_withdrawals enable row level security;
alter table public.account_group_withdrawal_allocations enable row level security;

drop policy if exists "Account groups are private" on public.account_groups;
create policy "Account groups are private" on public.account_groups for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Account memberships are private" on public.account_group_memberships;
create policy "Account memberships are private" on public.account_group_memberships for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Group trade links are private" on public.account_group_trade_links;
create policy "Group trade links are private" on public.account_group_trade_links for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Group withdrawals are private" on public.account_group_withdrawals;
create policy "Group withdrawals are private" on public.account_group_withdrawals for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Withdrawal allocations are private" on public.account_group_withdrawal_allocations;
create policy "Withdrawal allocations are private" on public.account_group_withdrawal_allocations for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.account_balances to authenticated;
grant select, insert, update, delete on public.account_groups to authenticated;
grant select, insert, update, delete on public.account_group_memberships to authenticated;
grant select, insert, update, delete on public.account_group_trade_links to authenticated;
grant select, insert, update, delete on public.account_group_withdrawals to authenticated;
grant select, insert, update, delete on public.account_group_withdrawal_allocations to authenticated;
