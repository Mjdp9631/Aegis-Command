-- AEGIS Self Mastery: deep work, random transmissions, and quarterly Director Reviews.
-- Non-destructive. Run once in Supabase SQL Editor.

create table if not exists public.deep_work_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  logged_on date not null default current_date,
  area text not null check (area in ('Mind', 'Body', 'Trading', 'Business')),
  focus text not null check (char_length(focus) between 1 and 200),
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  output text not null check (char_length(output) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.mastery_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lane text not null check (lane in ('mind', 'body')),
  challenge_type text not null check (challenge_type in ('research', 'body_activity')),
  title text not null check (char_length(title) between 1 and 220),
  instructions text not null check (char_length(instructions) between 1 and 4000),
  research_minutes integer check (research_minutes is null or research_minutes between 1 and 240),
  summary text,
  spoken_confirmed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.director_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  quarter_key text not null check (quarter_key ~ '^[0-9]{4}-Q[1-4]$'),
  wins text,
  bottlenecks text,
  standards text,
  next_focus text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, quarter_key)
);

create index if not exists deep_work_logs_user_created_idx on public.deep_work_logs (user_id, created_at desc);
create index if not exists mastery_challenges_user_created_idx on public.mastery_challenges (user_id, created_at desc);
create index if not exists director_reviews_user_quarter_idx on public.director_reviews (user_id, quarter_key);

alter table public.deep_work_logs enable row level security;
alter table public.mastery_challenges enable row level security;
alter table public.director_reviews enable row level security;

drop policy if exists "Deep work logs are private" on public.deep_work_logs;
create policy "Deep work logs are private" on public.deep_work_logs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Mastery challenges are private" on public.mastery_challenges;
create policy "Mastery challenges are private" on public.mastery_challenges for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Director reviews are private" on public.director_reviews;
create policy "Director reviews are private" on public.director_reviews for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.deep_work_logs to authenticated;
grant select, insert, update, delete on public.mastery_challenges to authenticated;
grant select, insert, update, delete on public.director_reviews to authenticated;
