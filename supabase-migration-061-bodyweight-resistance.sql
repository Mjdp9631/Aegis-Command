-- AEGIS 061 — allow bodyweight sets in the gym progress tracker.
-- Run once in the Supabase SQL Editor.

alter table public.training_sets
  drop constraint if exists training_sets_resistance_type_check;

alter table public.training_sets
  add constraint training_sets_resistance_type_check
  check (resistance_type in ('Weights', 'Bands', 'Bodyweight'));
