-- AEGIS 096 - project steps and their generated Command Center operations
-- are one lifecycle. Removing a step must remove its linked operation.

create or replace function public.aegis_delete_project_step_operation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.operation_id is not null then
    delete from public.operations where id = old.operation_id;
  end if;
  return old;
end;
$$;

drop trigger if exists business_project_steps_delete_operation on public.business_project_steps;
create trigger business_project_steps_delete_operation
after delete on public.business_project_steps
for each row execute function public.aegis_delete_project_step_operation();

-- Repair stale generated project operations whose source step was previously
-- removed. The generated brief format is exclusive to the project-step path.
delete from public.operations as operation
where operation.category = 'Business'
  and operation.brief like 'Project step %'
  and not exists (
    select 1
    from public.business_project_steps as step
    where step.operation_id = operation.id
  );
