-- AEGIS 107 — retain breached prop accounts as historical records.
-- A breach is separate from an account failure so the account's history and
-- exact closure reason stay visible without being counted as active capital.

alter table public.account_balances
  add column if not exists is_breached boolean not null default false,
  add column if not exists breached_at timestamptz;

create index if not exists account_balances_breach_idx
  on public.account_balances (user_id, is_breached, created_at desc);
