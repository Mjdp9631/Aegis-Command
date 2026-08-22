-- AEGIS 098 - remove incomplete operations that were created only from an
-- evening advisory's Jarvis/Alfred explanation.
--
-- These rows were not real, scheduled actions: their brief is the exact
-- advisory-reference template, they are not daily pillars, and they have no
-- mission linkage. Completed history is deliberately preserved.

delete from public.operations
where coalesce(completed, false) is false
  and lower(coalesce(status, '')) not in ('complete', 'completed', 'done')
  and coalesce(is_daily, false) is false
  and mission_id is null
  and coalesce(brief, '') ~* '^jarvis reference:'
  and coalesce(brief, '') ~* 'alfred reference:'
  and not exists (
    select 1
    from public.operation_mission_links as link
    where link.operation_id = operations.id
  );
