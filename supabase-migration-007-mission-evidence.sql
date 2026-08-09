alter table public.missions
  add column if not exists completion_type text not null default 'binary' check (completion_type in ('binary', 'units')),
  add column if not exists completion_definition text,
  add column if not exists unit_label text,
  add column if not exists target_count integer check (target_count is null or target_count >= 1),
  add column if not exists completed_count integer not null default 0 check (completed_count >= 0),
  add column if not exists completed boolean not null default false;

update public.missions
set completed = true
where progress >= 100 and completed = false;
