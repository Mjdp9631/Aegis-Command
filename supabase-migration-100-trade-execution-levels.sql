-- AEGIS 100 — optional trade execution levels for gross P&L estimates.
alter table public.trade_debriefs
  add column if not exists entry_price numeric,
  add column if not exists take_profit_price numeric,
  add column if not exists stop_loss_price numeric,
  add column if not exists lot_size numeric;

alter table public.trade_debriefs
  drop constraint if exists trade_debriefs_entry_price_positive,
  drop constraint if exists trade_debriefs_take_profit_price_positive,
  drop constraint if exists trade_debriefs_stop_loss_price_positive,
  drop constraint if exists trade_debriefs_lot_size_positive;

alter table public.trade_debriefs
  add constraint trade_debriefs_entry_price_positive check (entry_price is null or entry_price > 0),
  add constraint trade_debriefs_take_profit_price_positive check (take_profit_price is null or take_profit_price > 0),
  add constraint trade_debriefs_stop_loss_price_positive check (stop_loss_price is null or stop_loss_price > 0),
  add constraint trade_debriefs_lot_size_positive check (lot_size is null or lot_size > 0);
