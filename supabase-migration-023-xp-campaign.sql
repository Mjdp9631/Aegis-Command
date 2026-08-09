-- AEGIS COMMAND — one-time XP campaign start
-- Run this once in Supabase SQL Editor before using "Start campaign tracking".

create table if not exists public.xp_campaigns (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  started_at timestamptz not null default now()
);

alter table public.xp_campaigns enable row level security;

drop policy if exists "XP campaign is private" on public.xp_campaigns;
create policy "XP campaign is private"
on public.xp_campaigns for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert on table public.xp_campaigns to authenticated;
