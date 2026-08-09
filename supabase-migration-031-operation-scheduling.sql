-- AEGIS Operations: persist a concrete definition of done with every operation.
alter table public.operations
  add column if not exists brief text;
