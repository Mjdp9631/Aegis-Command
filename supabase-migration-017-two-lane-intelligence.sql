-- AEGIS COMMAND / two-lane intelligence
-- Run once in Supabase SQL Editor after migration 014.

create table if not exists public.ai_roadmap_missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  advisory_id uuid references public.ai_advisories(id) on delete set null,
  phase integer not null check (phase between 0 and 4),
  title text not null,
  category text not null check (category in ('Recovery', 'Trading', 'Business', 'Mind')),
  priority text not null check (priority in ('Do now', 'Schedule')),
  objective text not null,
  rationale text not null,
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'completed', 'superseded')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.ai_mission_suggestions
  add column if not exists cadence_key text,
  add column if not exists escalation_level integer not null default 1 check (escalation_level between 1 and 3),
  add column if not exists expires_at timestamptz;

alter table public.ai_roadmap_missions enable row level security;

drop policy if exists "AI roadmap missions are private" on public.ai_roadmap_missions;
create policy "AI roadmap missions are private" on public.ai_roadmap_missions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists ai_roadmap_user_status_idx
  on public.ai_roadmap_missions (user_id, status, created_at desc);
create index if not exists ai_suggestions_user_kind_created_idx
  on public.ai_mission_suggestions (user_id, mission_kind, created_at desc);
