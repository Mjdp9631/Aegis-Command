-- AEGIS 091 - backfill the durable PT completion pathway.
--
-- Some pre-family PT operation rows were never linked to their 10-session
-- recovery mission. The client can safely recover an unambiguous metric match
-- for those historical rows, but this migration restores the explicit family
-- link so all future PT completions take the normal durable path.
--
-- Only link a PT family when there is exactly one active, 10-session PT/
-- orthopedic measured mission for that user. Ambiguous recovery missions are
-- deliberately left untouched for manual selection in Mission Control.

with pt_families as (
  select distinct
    operation.user_id,
    nullif(trim(operation.operation_family_key), '') as operation_family_key
  from public.operations as operation
  where nullif(trim(operation.operation_family_key), '') is not null
    and lower(coalesce(operation.title, '') || ' ' || coalesce(operation.brief, ''))
      ~ '(physical therapy|orthopedic|pt[[:space:]]*sessions?|rehab)'
), pt_candidates as (
  select
    family.user_id,
    family.operation_family_key,
    mission.id as mission_id
  from pt_families as family
  join public.missions as mission
    on mission.user_id = family.user_id
  where mission.completed is false
    and lower(coalesce(mission.completion_type, '')) = 'units'
    and coalesce(mission.target_count, 0) = 10
    and lower(coalesce(mission.title, '') || ' ' || coalesce(mission.completion_definition, '') || ' ' || coalesce(mission.unit_label, ''))
      ~ '(physical therapy|orthopedic|pt[[:space:]]*sessions?|rehab)'
), resolved_paths as (
  select user_id, operation_family_key, min(mission_id::text)::uuid as mission_id
  from pt_candidates
  group by user_id, operation_family_key
  having count(distinct mission_id) = 1
)
insert into public.operation_family_mission_links (
  user_id,
  operation_family_key,
  mission_id,
  is_explicit
)
select user_id, operation_family_key, mission_id, true
from resolved_paths
on conflict (user_id, operation_family_key, mission_id) do nothing;
