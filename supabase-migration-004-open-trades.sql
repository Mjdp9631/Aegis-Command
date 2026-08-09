-- Allow a trade to be logged at entry, then completed later.
alter table public.trade_debriefs
  alter column r_multiple drop not null,
  add column if not exists trade_status text not null default 'Closed';

alter table public.trade_debriefs
  drop constraint if exists trade_debriefs_trade_status_check;

alter table public.trade_debriefs
  add constraint trade_debriefs_trade_status_check
  check (trade_status in ('Open', 'Closed'));

alter table public.trade_debriefs
  drop constraint if exists trade_debriefs_outcome_check;

alter table public.trade_debriefs
  add constraint trade_debriefs_outcome_check
  check (outcome in ('Open', 'Win', 'Small win', 'B/E', 'Loss', 'Small loss'));

update public.trade_debriefs
set trade_status = 'Closed'
where trade_status is null;
