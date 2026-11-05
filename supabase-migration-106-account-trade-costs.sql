-- AEGIS 106 — retain gross P&L, fees, and swaps for each account allocation.
-- pnl_usd remains the net amount used by the account balance calculation.

alter table public.account_group_trade_allocations
  add column if not exists gross_pnl_usd numeric(14,2),
  add column if not exists fee_usd numeric(14,2),
  add column if not exists swap_usd numeric(14,2);

alter table public.account_group_trade_allocations
  add constraint account_group_trade_allocations_fee_nonpositive_check
  check (fee_usd is null or fee_usd <= 0);
