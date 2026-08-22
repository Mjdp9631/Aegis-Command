-- AEGIS 097 - remove older orphaned project-step operations.
-- Earlier edits could detach a pending operation from its project step before
-- the step was removed. These rows use the generated "Project — Step" title
-- but no longer have a business_project_steps.operation_id link.
--
-- Limit this repair to incomplete Business rows that match an existing project
-- title, so completed history and unrelated business operations are preserved.

delete from public.operations as operation
where operation.category = 'Business'
  and coalesce(operation.completed, false) is false
  and lower(coalesce(operation.status, '')) <> 'complete'
  and not exists (
    select 1
    from public.business_project_steps as step
    where step.operation_id = operation.id
  )
  and exists (
    select 1
    from public.business_projects as project
    where operation.title like project.title || ' — %'
  );
