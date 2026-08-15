-- AEGIS 083 — benchmarked Practical / Adversarial capability campaigns.
-- Run after migration 082. Each benchmark has one active operation; completing
-- it unlocks the next one and earns its individually weighted XP reward.

create table if not exists public.capability_benchmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  skill_id uuid not null references public.capability_skills(id) on delete cascade,
  level text not null check (level in ('Novice', 'Competent', 'Proficient', 'Master')),
  sort_order integer not null check (sort_order between 1 and 4),
  requirement text not null check (char_length(requirement) between 3 and 2000),
  xp_reward integer not null check (xp_reward between 0 and 500),
  operation_id uuid unique references public.operations(id) on delete set null,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (skill_id, sort_order),
  unique (skill_id, level)
);

create table if not exists public.capability_benchmark_completion_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  benchmark_id uuid not null references public.capability_benchmarks(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  xp_reward integer not null check (xp_reward between 0 and 500),
  created_at timestamptz not null default now(),
  unique (user_id, benchmark_id, operation_id)
);

create index if not exists capability_benchmarks_user_skill_idx on public.capability_benchmarks (user_id, skill_id, sort_order);
create index if not exists capability_benchmark_ledger_user_created_idx on public.capability_benchmark_completion_ledger (user_id, created_at desc);

alter table public.capability_benchmarks enable row level security;
alter table public.capability_benchmark_completion_ledger enable row level security;

drop policy if exists "Capability benchmarks are private" on public.capability_benchmarks;
create policy "Capability benchmarks are private" on public.capability_benchmarks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Capability benchmark ledger is private" on public.capability_benchmark_completion_ledger;
create policy "Capability benchmark ledger is private" on public.capability_benchmark_completion_ledger for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.capability_benchmarks, public.capability_benchmark_completion_ledger to authenticated;
grant all privileges on public.capability_benchmarks, public.capability_benchmark_completion_ledger to service_role;

create or replace function public.aegis_sync_capability_benchmark_completion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_benchmark public.capability_benchmarks%rowtype;
  v_next public.capability_benchmarks%rowtype;
  v_skill public.capability_skills%rowtype;
  v_rows integer := 0;
  v_next_operation uuid;
begin
  select * into v_benchmark from public.capability_benchmarks
    where operation_id = new.id and user_id = new.user_id;
  if not found then return new; end if;

  if new.completed is true and coalesce(old.completed, false) is false then
    insert into public.capability_benchmark_completion_ledger (user_id, benchmark_id, operation_id, xp_reward)
    values (new.user_id, v_benchmark.id, new.id, v_benchmark.xp_reward)
    on conflict (user_id, benchmark_id, operation_id) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then return new; end if;

    update public.capability_benchmarks set completed = true, completed_at = now() where id = v_benchmark.id;
    select * into v_next from public.capability_benchmarks
      where skill_id = v_benchmark.skill_id and sort_order = v_benchmark.sort_order + 1 and completed = false
      order by sort_order limit 1;
    if found and v_next.operation_id is null then
      select * into v_skill from public.capability_skills where id = v_benchmark.skill_id;
      insert into public.operations (user_id, title, category, brief, status, completed, scheduled_date, operation_date, is_daily, allow_unlinked, operation_family_key)
      values (
        new.user_id,
        v_skill.title || ' — ' || v_next.level || ' benchmark',
        'Self Mastery',
        v_next.requirement || E'\n\nCapability campaign: complete this benchmark to unlock the next level and earn +' || v_next.xp_reward || ' XP.',
        'Queued', false, current_date, current_date, false, true,
        'capability-' || replace(v_benchmark.skill_id::text, '-', '') || '-' || v_next.sort_order
      ) returning id into v_next_operation;
      update public.capability_benchmarks set operation_id = v_next_operation where id = v_next.id;
    end if;
    update public.capability_skills set status = case when not exists (
      select 1 from public.capability_benchmarks where skill_id = v_benchmark.skill_id and completed = false
    ) then 'Complete' else 'Active' end, updated_at = now() where id = v_benchmark.skill_id;
  elsif new.completed is false and coalesce(old.completed, false) is true then
    delete from public.capability_benchmark_completion_ledger
      where user_id = new.user_id and benchmark_id = v_benchmark.id and operation_id = new.id;
    update public.capability_benchmarks set completed = false, completed_at = null where id = v_benchmark.id;
    update public.capability_skills set status = 'Active', updated_at = now() where id = v_benchmark.skill_id;
  end if;
  return new;
end $$;

drop trigger if exists aegis_capability_benchmark_operation_sync on public.operations;
create trigger aegis_capability_benchmark_operation_sync
  after update of completed on public.operations
  for each row execute function public.aegis_sync_capability_benchmark_completion();
