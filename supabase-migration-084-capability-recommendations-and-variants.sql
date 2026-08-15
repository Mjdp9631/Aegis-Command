-- AEGIS 084 — generated capability recommendations, variants, and resume flow.
-- Run after migration 083.

alter table public.capability_skills
  add column if not exists family_key text,
  add column if not exists variant_key text;

create unique index if not exists capability_skills_started_variant_unique
  on public.capability_skills (user_id, family_key, coalesce(variant_key, '__default__'))
  where family_key is not null;

create table if not exists public.capability_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  skill_type text not null check (skill_type in ('Practical', 'Adversarial')),
  family_key text not null,
  title text not null check (char_length(title) between 1 and 160),
  description text,
  variant_options jsonb not null default '[]'::jsonb,
  benchmark_template jsonb not null,
  status text not null default 'Pending' check (status in ('Pending', 'Accepted', 'Denied')),
  selected_variant text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists capability_recommendations_pending_idx
  on public.capability_recommendations (user_id, skill_type, status, created_at desc);

alter table public.capability_recommendations enable row level security;
drop policy if exists "Capability recommendations are private" on public.capability_recommendations;
create policy "Capability recommendations are private" on public.capability_recommendations for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.capability_recommendations to authenticated;
grant all privileges on public.capability_recommendations to service_role;

create or replace function public.aegis_resume_capability_skill(p_skill_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_skill public.capability_skills%rowtype;
  v_next public.capability_benchmarks%rowtype;
  v_operation_id uuid;
begin
  select * into v_skill from public.capability_skills where id = p_skill_id and user_id = auth.uid();
  if not found then raise exception 'Capability skill not found'; end if;
  if v_skill.status = 'Complete' then raise exception 'This capability campaign is already complete'; end if;
  select * into v_next from public.capability_benchmarks where skill_id = v_skill.id and completed = false order by sort_order limit 1;
  if not found then raise exception 'No incomplete benchmark found'; end if;
  if v_next.operation_id is null then
    insert into public.operations (user_id, title, category, brief, status, completed, scheduled_date, operation_date, is_daily, allow_unlinked, operation_family_key)
    values (v_skill.user_id, v_skill.title || ' — ' || v_next.level || ' benchmark', 'Self Mastery',
      v_next.requirement || E'\n\nCapability campaign: complete this benchmark to unlock the next level and earn +' || v_next.xp_reward || ' XP.',
      'Queued', false, current_date, current_date, false, true,
      'capability-' || replace(v_skill.id::text, '-', '') || '-' || v_next.sort_order)
    returning id into v_operation_id;
    update public.capability_benchmarks set operation_id = v_operation_id where id = v_next.id;
  else
    v_operation_id := v_next.operation_id;
  end if;
  update public.capability_skills set status = 'Active', updated_at = now() where id = v_skill.id;
  return v_operation_id;
end $$;

grant execute on function public.aegis_resume_capability_skill(uuid) to authenticated;
