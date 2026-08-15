-- AEGIS 081 — Rebalance Special Project XP and repair the legacy Aegis project.
-- Run after migrations 079 and 080.

-- A substantial build should matter, but one project must not jump several
-- CCFX levels. Apply the revised weights to historical and future projects.
update public.business_projects
set xp_reward = case effort_band
  when 'Minor' then 10
  when 'Standard' then 25
  when 'Major' then 50
  when 'Flagship' then 100
  else 25
end
where project_mode = 'Milestone';

-- Migration 079 only imported this mission if it was already marked complete.
-- It represents a completed release regardless of that legacy mission flag.
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
  100
from public.missions m
where lower(coalesce(m.title, '')) in ('created aegis', 'create aegis')
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
  xp_reward = 100;

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
  xp_reward = 100
where lower(coalesce(title, '')) in ('created aegis', 'create aegis');
