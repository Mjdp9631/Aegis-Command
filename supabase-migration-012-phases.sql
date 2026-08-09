create table if not exists public.phase_protocols (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  active_phase integer not null default 0 check (active_phase between 0 and 4),
  advanced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.phase_protocols enable row level security;

drop policy if exists "Phase protocol is private" on public.phase_protocols;
create policy "Phase protocol is private"
  on public.phase_protocols for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
