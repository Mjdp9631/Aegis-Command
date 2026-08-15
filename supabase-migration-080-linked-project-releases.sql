-- Linked finite releases keep a completed project immutable while allowing
-- subsequent upgrades to track their own step list, progress, proof, and XP.
alter table public.business_projects
  add column if not exists parent_project_id uuid references public.business_projects(id) on delete set null;

alter table public.business_projects
  drop constraint if exists business_projects_parent_project_check;

alter table public.business_projects
  add constraint business_projects_parent_project_check
  check (parent_project_id is null or parent_project_id <> id);

create index if not exists business_projects_user_parent_idx
  on public.business_projects (user_id, parent_project_id, logged_on desc);
