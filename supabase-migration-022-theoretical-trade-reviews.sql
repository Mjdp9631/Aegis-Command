-- A pass/no-entry explanation belongs to the independent review record,
-- never to the trading journal itself.
alter table public.trade_reviews
  add column if not exists no_entry_reason text;
