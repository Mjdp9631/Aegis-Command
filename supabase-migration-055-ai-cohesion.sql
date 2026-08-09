-- AEGIS 055 — shared AI evidence, feedback, and mission outcomes.
-- Run once in Supabase SQL Editor after migration 054.

alter table public.ai_advisories
  add column if not exists operating_date date,
  add column if not exists scan_mode text;

alter table public.ai_mission_suggestions
  add column if not exists evidence_ids jsonb not null default '[]'::jsonb;

alter table public.ai_roadmap_missions
  add column if not exists evidence_ids jsonb not null default '[]'::jsonb;

alter table public.missions
  add column if not exists source_suggestion_id uuid references public.ai_mission_suggestions(id) on delete set null,
  add column if not exists source_advisory_id uuid references public.ai_advisories(id) on delete set null,
  add column if not exists evidence_ids jsonb not null default '[]'::jsonb,
  add column if not exists accepted_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists outcome_status text,
  add column if not exists outcome_note text,
  add column if not exists outcome_rating integer check (outcome_rating is null or outcome_rating between 1 and 5);

create table if not exists public.ai_recommendation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  suggestion_id uuid not null references public.ai_mission_suggestions(id) on delete cascade,
  feedback_type text not null check (feedback_type in ('useful', 'irrelevant', 'too_easy', 'too_hard', 'already_done', 'wrong')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_calibration_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start date not null,
  summary text not null,
  adjustments jsonb not null default '[]'::jsonb,
  source_counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.ai_recommendation_feedback enable row level security;
alter table public.ai_calibration_reviews enable row level security;

drop policy if exists "AI recommendation feedback is private" on public.ai_recommendation_feedback;
create policy "AI recommendation feedback is private" on public.ai_recommendation_feedback
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "AI calibration reviews are private" on public.ai_calibration_reviews;
create policy "AI calibration reviews are private" on public.ai_calibration_reviews
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index if not exists ai_feedback_user_created_idx on public.ai_recommendation_feedback (user_id, created_at desc);
create index if not exists missions_user_outcome_idx on public.missions (user_id, outcome_status, completed_at desc);
create index if not exists ai_calibration_user_week_idx on public.ai_calibration_reviews (user_id, week_start desc);

create or replace function public.aegis_stamp_mission_outcome()
returns trigger language plpgsql as $$
begin
  if new.accepted_at is null and (tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.source_suggestion_id is distinct from old.source_suggestion_id)) then
    new.accepted_at := now();
  end if;
  if new.outcome_status = 'in_progress' and new.started_at is null then
    new.started_at := now();
  end if;
  if new.completed is true and (tg_op = 'INSERT' or coalesce(old.completed, false) is false) then
    new.completed_at := coalesce(new.completed_at, now());
    new.outcome_status := coalesce(new.outcome_status, 'completed');
  elsif new.completed is false and tg_op = 'UPDATE' and coalesce(old.completed, false) is true then
    new.completed_at := null;
    if new.outcome_status = 'completed' then new.outcome_status := 'in_progress'; end if;
  end if;
  return new;
end $$;

drop trigger if exists aegis_mission_outcome_stamp on public.missions;
create trigger aegis_mission_outcome_stamp
  before insert or update on public.missions
  for each row execute function public.aegis_stamp_mission_outcome();

grant select, insert, update, delete on public.ai_recommendation_feedback, public.ai_calibration_reviews to authenticated;
grant all privileges on public.ai_recommendation_feedback, public.ai_calibration_reviews to service_role;
