-- AEGIS 045 — clearer operation departments.
-- Run once in Supabase SQL Editor after migrations 043–044.

-- Remove the older category check before normalizing legacy Mind rows.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.operations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format(
      'alter table public.operations drop constraint if exists %I',
      constraint_row.conname
    );
  end loop;
end $$;

update public.operations
set category = 'Self Mastery'
where category = 'Mind';

alter table public.operations
  add constraint operations_category_check
  check (category in ('Recovery', 'Trading', 'Business', 'Self Mastery', 'Life Admin', 'Body'));
