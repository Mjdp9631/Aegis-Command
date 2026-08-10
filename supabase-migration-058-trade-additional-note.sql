-- AEGIS 058 — second trade note, separate from rule-violation and debrief notes.
alter table public.trade_debriefs
  add column if not exists note text;
