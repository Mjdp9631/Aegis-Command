-- AEGIS 092 — align the mission category constraint with the current UI.
-- Run once in the Supabase SQL Editor.
--
-- Early deployments allowed only Mind. The UI and operation pathways now use
-- Self Mastery and Life Admin, so normalize the legacy vocabulary before
-- replacing the check constraint.

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.missions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format(
      'alter table public.missions drop constraint if exists %I',
      constraint_row.conname
    );
  end loop;
end $$;

update public.missions
set category = 'Self Mastery'
where category in ('Mind', 'Body', 'Mastery');

alter table public.missions
  add constraint missions_category_check
  check (category in ('Recovery', 'Trading', 'Business', 'Self Mastery', 'Life Admin'));
