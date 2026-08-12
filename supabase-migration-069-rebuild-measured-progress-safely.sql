-- AEGIS 069 — recover measured mission progress from durable operation evidence.
-- Run once after migration 068. This is monotonic: it can restore evidence-backed
-- progress lost by a stale/partial reconciliation, but never lowers a count.

do $$
declare
  m record;
  observed integer;
begin
  for m in
    select id, user_id, target_count, completed_count
    from public.missions
    where completion_type = 'units'
      and target_count is not null
  loop
    with operation_evidence as (
      select distinct
        'operation:' || o.id::text as evidence_id
      from public.operations o
      where o.user_id = m.user_id
        and o.completed is true
        and lower(coalesce(o.title, '')) not like '%evening%mission%debrief%'
        and (
          o.mission_id = m.id
          or public.aegis_operation_metric_matches(m.metric_key, public.aegis_infer_operation_metric(o.title, o.metric_key))
        )
      union
      select distinct
        'occurrence:' || oo.id::text as evidence_id
      from public.operation_occurrences oo
      join public.operations o on o.id = oo.operation_id and o.user_id = oo.user_id
      where o.user_id = m.user_id
        and oo.completed is true
        and lower(coalesce(o.title, '')) not like '%evening%mission%debrief%'
        and (
          o.mission_id = m.id
          or public.aegis_operation_metric_matches(m.metric_key, public.aegis_infer_operation_metric(o.title, o.metric_key))
        )
    )
    select least(coalesce(m.target_count, 0), count(*)::integer)
    into observed
    from operation_evidence;

    update public.missions
    set completed_count = greatest(coalesce(completed_count, 0), coalesce(observed, 0)),
        completed = greatest(coalesce(completed_count, 0), coalesce(observed, 0)) >= target_count,
        progress = round((greatest(coalesce(completed_count, 0), coalesce(observed, 0))::numeric / target_count::numeric) * 100)::integer
    where id = m.id;
  end loop;
end $$;

-- Restore the two progress values confirmed by the account owner if an older
-- browser reconciliation already erased the operation evidence. These are
-- lower bounds only; they never reduce a value already recorded in Supabase.
update public.missions
set completed_count = greatest(coalesce(completed_count, 0), 14),
    completed = greatest(coalesce(completed_count, 0), 14) >= target_count,
    progress = round((greatest(coalesce(completed_count, 0), 14)::numeric / target_count::numeric) * 100)::integer
where completion_type = 'units'
  and target_count >= 15
  and (lower(coalesce(title, '')) like '%think%grow%rich%'
    or lower(coalesce(completion_definition, '')) like '%think%grow%rich%');

update public.missions
set completed_count = greatest(coalesce(completed_count, 0), 5),
    completed = greatest(coalesce(completed_count, 0), 5) >= target_count,
    progress = round((greatest(coalesce(completed_count, 0), 5)::numeric / target_count::numeric) * 100)::integer
where completion_type = 'units'
  and target_count = 10
  and (lower(coalesce(title, '')) ~ '(pt|physical therapy|orthopedic|acl|rehab)'
    or lower(coalesce(completion_definition, '')) ~ '(pt|physical therapy|orthopedic|acl|rehab)');
