-- DETECTIVE journal fields, matching the existing Notion journal.
alter table public.trade_debriefs
  add column if not exists pnl_percent numeric,
  add column if not exists outcome text check (outcome in ('Win','B/E','Loss')),
  add column if not exists direction text check (direction in ('Long','Short')),
  add column if not exists session text,
  add column if not exists mae_30m numeric,
  add column if not exists mfe_30m numeric,
  add column if not exists psychology_state text,
  add column if not exists plan_violation boolean not null default false,
  add column if not exists violation_type text,
  add column if not exists post_trade_lesson text,
  add column if not exists market_condition text,
  add column if not exists cb_hour text,
  add column if not exists position text,
  add column if not exists account text,
  add column if not exists trade_day text,
  add column if not exists trade_month text,
  add column if not exists session_time text,
  add column if not exists entry_timeframe text,
  add column if not exists wick text,
  add column if not exists trade_type text;

alter table public.trade_debriefs
  drop constraint if exists trade_debriefs_outcome_check;

alter table public.trade_debriefs
  add constraint trade_debriefs_outcome_check
  check (outcome in ('Win', 'Small win', 'B/E', 'Loss', 'Small loss'));
