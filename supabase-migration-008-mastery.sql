create table if not exists public.mastery_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null check (category in ('Book', 'Trading Note', 'Psychology', 'Space', 'Business', 'Stoicism', 'Health', 'Performance')),
  title text not null check (char_length(title) between 1 and 200),
  rating integer check (rating between 1 and 5),
  summary text,
  favorite_quotes text,
  key_lessons text,
  action_items text,
  created_at timestamptz not null default now()
);

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_type text not null check (session_type in ('Gym', 'Sports', 'Performance')),
  title text not null check (char_length(title) between 1 and 200),
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 1440),
  notes text,
  logged_on date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.mastery_entries enable row level security;
alter table public.training_sessions enable row level security;

drop policy if exists "Mastery entries are private" on public.mastery_entries;
create policy "Mastery entries are private" on public.mastery_entries for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Training sessions are private" on public.training_sessions;
create policy "Training sessions are private" on public.training_sessions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.mastery_entries, public.training_sessions to authenticated;
