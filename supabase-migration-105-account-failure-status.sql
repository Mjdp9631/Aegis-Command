-- AEGIS 105 — retain failed trading accounts as historical records.
-- Existing accounts remain active through the column default.

alter table public.account_balances
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active', 'failed')),
  add column if not exists account_status_changed_at timestamptz;

create index if not exists account_balances_status_idx
  on public.account_balances (user_id, account_status, created_at desc);
