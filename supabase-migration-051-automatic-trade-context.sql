-- Blind AI trade scenarios. One post-trade image per timeframe is used twice:
-- the pre-entry pass is temporally blind, then the full image is reviewed.
create table if not exists public.ai_trade_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trade_id uuid not null references public.trade_debriefs(id) on delete cascade,
  scenario_payload jsonb not null default '{}'::jsonb,
  scenario_action text not null,
  simulated_r_multiple numeric not null default 0,
  simulated_pnl_percent numeric not null default 0,
  actual_r_multiple numeric,
  actual_pnl_percent numeric,
  scenario_result text not null default 'unclear',
  screenshot_count integer not null default 0 check (screenshot_count between 0 and 5),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz not null default now()
);

alter table public.ai_trade_scenarios enable row level security;
drop policy if exists "AI trade scenarios are private" on public.ai_trade_scenarios;
create policy "AI trade scenarios are private" on public.ai_trade_scenarios
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists ai_trade_scenarios_user_created_idx
  on public.ai_trade_scenarios (user_id, created_at desc);

grant select, insert, update, delete on public.ai_trade_scenarios to authenticated;
