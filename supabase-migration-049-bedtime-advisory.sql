-- AEGIS 049 — bedtime debriefs are user-triggered and read-only.
-- Run once in Supabase SQL Editor. This does not touch operations.

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.ai_advisories'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%advisory_type%'
  loop
    execute format(
      'alter table public.ai_advisories drop constraint if exists %I',
      constraint_row.conname
    );
  end loop;
end $$;

alter table public.ai_advisories
  add constraint ai_advisories_advisory_type_check
  check (advisory_type in ('morning', 'signal', 'evening', 'bedtime', 'scan'));
