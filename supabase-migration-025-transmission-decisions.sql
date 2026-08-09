-- AEGIS transmissions: decision states, category filing, and potential bonus XP.
-- Run once in Supabase SQL Editor after migration 024.

alter table public.mastery_challenges
  add column if not exists status text not null default 'generated' check (status in ('generated', 'accepted', 'denied', 'completed')),
  add column if not exists category text,
  add column if not exists difficulty text not null default 'standard' check (difficulty in ('easy', 'standard', 'advanced')),
  add column if not exists xp_reward integer not null default 0 check (xp_reward >= 0),
  add column if not exists accepted_at timestamptz,
  add column if not exists denied_at timestamptz;

-- Existing incomplete legacy transmissions are treated as accepted so none disappear.
update public.mastery_challenges
set status = case when completed_at is not null then 'completed' else 'accepted' end
where status = 'generated' and created_at < now() - interval '1 minute';

create index if not exists mastery_challenges_user_status_idx
  on public.mastery_challenges (user_id, status, created_at desc);
