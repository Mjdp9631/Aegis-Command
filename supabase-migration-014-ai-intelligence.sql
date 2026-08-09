-- AEGIS COMMAND / AI intelligence storage
-- Run once in Supabase SQL Editor.

create table if not exists public.ai_advisories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  advisory_type text not null check (advisory_type in ('morning', 'signal', 'evening', 'scan')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_mission_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  advisory_id uuid references public.ai_advisories(id) on delete cascade,
  advisor text not null check (advisor in ('Jarvis', 'Alfred')),
  mission_kind text not null check (mission_kind in ('corrective', 'challenge')),
  title text not null,
  category text not null check (category in ('Recovery', 'Trading', 'Business', 'Mind')),
  priority text not null check (priority in ('Do now', 'Schedule')),
  rationale text not null,
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'acknowledged', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.ai_advisories enable row level security;
alter table public.ai_mission_suggestions enable row level security;

drop policy if exists "AI advisories are private" on public.ai_advisories;
create policy "AI advisories are private" on public.ai_advisories
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "AI suggestions are private" on public.ai_mission_suggestions;
create policy "AI suggestions are private" on public.ai_mission_suggestions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists ai_advisories_user_created_idx on public.ai_advisories (user_id, created_at desc);
create index if not exists ai_suggestions_user_status_idx on public.ai_mission_suggestions (user_id, status, created_at desc);
