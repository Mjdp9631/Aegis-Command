-- AEGIS 079 — Special Projects use finite, evidence-backed milestones.
-- Run once in the Supabase SQL Editor after migration 078.

alter table public.business_projects
  add column if not exists project_mode text not null default 'Milestone',
  add column if not exists effort_band text not null default 'Standard',
  add column if not exists estimated_hours integer,
  add column if not exists completion_evidence text,
  add column if not exists xp_reward integer not null default 60,
  add column if not exists source_mission_id uuid references public.missions(id) on delete set null;

alter table public.business_projects
  drop constraint if exists business_projects_project_mode_check,
  drop constraint if exists business_projects_effort_band_check,
  drop constraint if exists business_projects_estimated_hours_check,
  drop constraint if exists business_projects_xp_reward_check;

alter table public.business_projects
  add constraint business_projects_project_mode_check
    check (project_mode in ('Milestone', 'Ongoing system')),
  add constraint business_projects_effort_band_check
    check (effort_band in ('Minor', 'Standard', 'Major', 'Flagship')),
  add constraint business_projects_estimated_hours_check
    check (estimated_hours is null or estimated_hours between 1 and 10000),
  add constraint business_projects_xp_reward_check
    check (xp_reward between 0 and 500);

create unique index if not exists business_projects_user_source_mission_idx
  on public.business_projects (user_id, source_mission_id)
  where source_mission_id is not null;

-- Legacy projects were all worth 5 XP to start and 30 XP to complete. Replace
-- that flat score with a default Standard milestone reward. Starting work no
-- longer earns XP; a finite project earns it only when complete.
update public.business_projects
set xp_reward = case effort_band
  when 'Minor' then 20
  when 'Major' then 120
  when 'Flagship' then 250
  else 60
end
where project_mode = 'Milestone';

update public.business_projects
set xp_reward = 0
where project_mode = 'Ongoing system';

-- "Created Aegis" is a completed flagship release, not a generic project
-- start. Preserve it in Special Projects with a durable definition of done.
insert into public.business_projects (
  user_id, title, status, priority, project_type, progress, outcome,
  next_action, logged_on, source_mission_id, project_mode, effort_band,
  estimated_hours, completion_evidence, xp_reward
)
select
  m.user_id,
  m.title,
  'Complete',
  case lower(coalesce(m.priority, ''))
    when 'do now' then 'Do now'
    when 'delegate' then 'Delegate'
    when 'eliminate' then 'Eliminate'
    else 'Schedule'
  end,
  'Aegis system',
  100,
  'Aegis Command v1 is deployed and usable as a live personal command system.',
  'Operate and improve Aegis through separately scoped releases.',
  coalesce((m.completed_at at time zone 'America/New_York')::date, (m.created_at at time zone 'America/New_York')::date),
  m.id,
  'Milestone', 'Flagship', 120,
  'Aegis Command v1 was built, deployed, and made usable as a live command system.',
  250
from public.missions m
where m.completed is true
  and lower(coalesce(m.category, '')) = 'business'
  and lower(coalesce(m.title, '')) in ('created aegis', 'create aegis')
on conflict (user_id, source_mission_id) where source_mission_id is not null
do update set
  title = excluded.title,
  status = 'Complete',
  project_type = 'Aegis system',
  progress = 100,
  outcome = excluded.outcome,
  next_action = excluded.next_action,
  project_mode = 'Milestone',
  effort_band = 'Flagship',
  estimated_hours = 120,
  completion_evidence = excluded.completion_evidence,
  xp_reward = 250;

update public.business_projects
set
  status = 'Complete',
  project_type = 'Aegis system',
  progress = 100,
  outcome = coalesce(nullif(outcome, ''), 'Aegis Command v1 is deployed and usable as a live personal command system.'),
  next_action = coalesce(nullif(next_action, ''), 'Operate and improve Aegis through separately scoped releases.'),
  project_mode = 'Milestone',
  effort_band = 'Flagship',
  estimated_hours = 120,
  completion_evidence = coalesce(nullif(completion_evidence, ''), 'Aegis Command v1 was built, deployed, and made usable as a live command system.'),
  xp_reward = 250
where lower(coalesce(title, '')) in ('created aegis', 'create aegis');
