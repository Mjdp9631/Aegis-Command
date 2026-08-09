-- AEGIS 048 — preserve individual gym sets for reliable progress comparisons.
-- Run after migration 036. Existing aggregate rows remain valid.

alter table public.training_sets
  add column if not exists resistance_type text not null default 'Weights'
    check (resistance_type in ('Weights', 'Bands')),
  add column if not exists band_resistance text,
  add column if not exists set_number integer not null default 1
    check (set_number > 0);

update public.training_sets
set resistance_type = 'Weights'
where resistance_type is null;

update public.training_sets
set set_number = 1
where set_number is null or set_number < 1;

create index if not exists training_sets_exercise_progress_idx
  on public.training_sets (user_id, exercise_name, resistance_type, logged_on desc);

grant select, insert, update, delete on public.training_sets to authenticated;
