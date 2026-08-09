alter table public.operations
  add column if not exists status text not null default 'Queued'
  check (status in ('Queued', 'Scheduled', 'Ongoing', 'Complete'));

update public.operations
set status = 'Complete'
where completed is true and status = 'Queued';
