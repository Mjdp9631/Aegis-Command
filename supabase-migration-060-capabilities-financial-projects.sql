-- AEGIS 060 — practical/adversarial capabilities, financial foundation, and real projects.
-- Run once in the Supabase SQL Editor.

create table if not exists public.capability_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  skill_type text not null check (skill_type in ('Practical', 'Adversarial')),
  title text not null check (char_length(title) between 1 and 160),
  description text,
  status text not null default 'Planned' check (status in ('Planned', 'Active', 'Complete', 'Paused')),
  practice_count integer not null default 0 check (practice_count >= 0),
  last_practiced_on date,
  latest_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, skill_type, title)
);

create table if not exists public.capability_skill_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  skill_id uuid not null references public.capability_skills(id) on delete cascade,
  practiced_on date not null default current_date,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 1440),
  pressure_level text check (pressure_level is null or pressure_level in ('Low', 'Moderate', 'High')),
  result text not null check (char_length(result) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.financial_foundations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  monthly_income numeric not null default 0 check (monthly_income >= 0),
  monthly_expenses numeric not null default 0 check (monthly_expenses >= 0),
  liquid_reserves numeric not null default 0 check (liquid_reserves >= 0),
  emergency_fund_target numeric not null default 0 check (emergency_fund_target >= 0),
  debt_balance numeric not null default 0 check (debt_balance >= 0),
  business_revenue numeric not null default 0 check (business_revenue >= 0),
  notes text,
  updated_at timestamptz not null default now()
);

alter table public.business_projects
  add column if not exists project_type text not null default 'Real-world project',
  add column if not exists outcome text,
  add column if not exists next_action text,
  add column if not exists due_on date,
  add column if not exists progress integer not null default 0;

alter table public.business_projects
  drop constraint if exists business_projects_progress_check;
alter table public.business_projects
  add constraint business_projects_progress_check check (progress between 0 and 100);

create index if not exists capability_skills_user_type_idx on public.capability_skills (user_id, skill_type, status);
create index if not exists capability_skill_logs_user_date_idx on public.capability_skill_logs (user_id, practiced_on desc);
create index if not exists financial_foundations_user_idx on public.financial_foundations (user_id);
create index if not exists business_projects_user_due_idx on public.business_projects (user_id, due_on);

alter table public.capability_skills enable row level security;
alter table public.capability_skill_logs enable row level security;
alter table public.financial_foundations enable row level security;

drop policy if exists "Capability skills are private" on public.capability_skills;
create policy "Capability skills are private" on public.capability_skills for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Capability skill logs are private" on public.capability_skill_logs;
create policy "Capability skill logs are private" on public.capability_skill_logs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Financial foundations are private" on public.financial_foundations;
create policy "Financial foundations are private" on public.financial_foundations for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.capability_skills, public.capability_skill_logs, public.financial_foundations to authenticated;

-- Capability practice is evidence in the shared activity ledger, but it does
-- not award XP by itself or imply mastery.
create or replace function public.aegis_log_capability_practice()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_type text;
  v_title text;
begin
  select skill_type, title into v_type, v_title from public.capability_skills where id = new.skill_id;
  insert into public.activity_events(user_id, source_type, source_id, metric_key, occurred_at, quantity, metadata)
  values (new.user_id, 'capability_skill_logs', new.id,
    case when v_type = 'Adversarial' then 'mastery.adversarial_skill' else 'mastery.practical_skill' end,
    coalesce(new.practiced_on::timestamptz, now()), 1,
    jsonb_build_object('skill_type', v_type, 'skill_title', v_title, 'pressure_level', new.pressure_level, 'duration_minutes', new.duration_minutes, 'result', new.result,
      'xp_reward', (case when v_type = 'Adversarial' then 12 else 10 end) + case when new.pressure_level = 'High' then 3 when new.pressure_level = 'Moderate' then 1 else 0 end))
  on conflict (source_type, source_id) do update
    set metric_key = excluded.metric_key, occurred_at = excluded.occurred_at, metadata = excluded.metadata;
  return new;
end $$;

drop trigger if exists aegis_activity_capability_practice on public.capability_skill_logs;
create trigger aegis_activity_capability_practice after insert or update on public.capability_skill_logs
  for each row execute function public.aegis_log_capability_practice();

-- Keep the durable financial baseline in the shared evidence stream as well.
create or replace function public.aegis_log_financial_foundation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_events(user_id, source_type, source_id, metric_key, occurred_at, quantity, metadata)
  values (new.user_id, 'financial_foundations', new.id, 'business.financial_foundation', coalesce(new.updated_at, now()), 1,
    jsonb_build_object('monthly_income', new.monthly_income, 'monthly_expenses', new.monthly_expenses, 'liquid_reserves', new.liquid_reserves,
      'emergency_fund_target', new.emergency_fund_target, 'debt_balance', new.debt_balance, 'business_revenue', new.business_revenue, 'xp_reward', 20))
  on conflict (source_type, source_id) do update
    set occurred_at = excluded.occurred_at, metadata = excluded.metadata;
  return new;
end $$;

drop trigger if exists aegis_activity_financial_foundation on public.financial_foundations;
create trigger aegis_activity_financial_foundation after insert or update on public.financial_foundations
  for each row execute function public.aegis_log_financial_foundation();
