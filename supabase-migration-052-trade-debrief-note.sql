-- Keep the free-form debrief note separate from the rule-violation explanation.
alter table public.trade_debriefs
  add column if not exists debrief_note text;
