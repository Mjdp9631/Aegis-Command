create table if not exists public.business_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  status text not null default 'Active' check (status in ('Backlog', 'Active', 'Complete')),
  priority text not null default 'Schedule' check (priority in ('Do now', 'Schedule', 'Delegate', 'Eliminate')),
  created_at timestamptz not null default now()
);

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  platform text not null check (platform in ('YouTube', 'Instagram', 'X', 'Newsletter')),
  status text not null default 'Idea' check (status in ('Idea', 'Drafting', 'Ready', 'Published')),
  project_id uuid references public.business_projects(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.business_projects enable row level security;
alter table public.content_items enable row level security;

drop policy if exists "Business projects are private" on public.business_projects;
create policy "Business projects are private" on public.business_projects for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Content items are private" on public.content_items;
create policy "Content items are private" on public.content_items for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.business_projects, public.content_items to authenticated;
