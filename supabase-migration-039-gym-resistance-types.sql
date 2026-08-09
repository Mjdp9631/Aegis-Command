-- AEGIS gym resistance types.
-- Keeps existing weighted sets intact while allowing bands to be logged accurately.

alter table public.training_sets
  add column if not exists resistance_type text not null default 'Weights'
    check (resistance_type in ('Weights', 'Bands')),
  add column if not exists band_resistance text;

update public.training_sets
set resistance_type = 'Weights'
where resistance_type is null;
