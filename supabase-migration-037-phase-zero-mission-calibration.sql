-- Calibrate Phase 0 without disturbing the launched XP system.
-- Existing completed_count is retained; only the definition and target are clarified.

update public.missions
set
  title = 'Complete 10-session orthopedic recovery block',
  category = 'Recovery',
  completion_type = 'units',
  completion_definition = 'Regain full mobility and return to sports safely. Complete 10 PT sessions, log the response to each session, then reassess with the orthopedic/PT team before progressing.',
  unit_label = 'PT sessions',
  target_count = 10,
  completed_count = least(10, greatest(0, coalesce(completed_count, 0))),
  completed = least(10, greatest(0, coalesce(completed_count, 0))) >= 10,
  progress = round((least(10, greatest(0, coalesce(completed_count, 0)))::numeric / 10) * 100)
where lower(title) like '%orthopedic recovery%' or lower(title) like '%acl capacity%';

-- These were one-time setup tasks, not meaningful campaign missions. Complete
-- them so the active board is not cluttered with duplicates.
update public.missions
set completed = true, progress = 100
where title in (
  'Activate and Enforce Daily Mission Completion Tracking',
  'Activate and Track Daily Mission Completion'
);

-- The Phase 0 trading work is intentionally concrete: build a testable process,
-- then demonstrate it in repeated daily evidence.
insert into public.missions (user_id, title, category, priority, completion_type, completion_definition, unit_label, target_count, completed_count, progress, completed)
select auth.uid(), 'Build the Phase 0 trading execution playbook', 'Trading', 'High', 'units',
  'Document the five operating modules: condition, location, CBR/shift, entry/risk, and post-trade review. Each module must contain a clear rule and one visual example.',
  'playbook modules', 5, 0, 0, false
where auth.uid() is not null and not exists (
  select 1 from public.missions where user_id = auth.uid() and title = 'Build the Phase 0 trading execution playbook'
);

insert into public.missions (user_id, title, category, priority, completion_type, completion_definition, unit_label, target_count, completed_count, progress, completed)
select auth.uid(), 'Establish a 30-day Phase 0 operating baseline', 'Mind', 'Strategic', 'units',
  'Complete a daily scorecard: one chapter or captured learning, one deliberate planning action, and an honest evening debrief. The aim is reliable evidence, not perfection.',
  'daily scorecards', 30, 0, 0, false
where auth.uid() is not null and not exists (
  select 1 from public.missions where user_id = auth.uid() and title = 'Establish a 30-day Phase 0 operating baseline'
);
