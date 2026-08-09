create table if not exists public.trade_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trade_id uuid references public.trade_debriefs(id) on delete set null,
  trader_thesis text,
  review_payload jsonb not null,
  screenshot_count integer not null default 0 check (screenshot_count between 0 and 8),
  course_version text not null default '1.1',
  created_at timestamptz not null default now()
);

alter table public.trade_reviews enable row level security;
drop policy if exists "Trade reviews are private" on public.trade_reviews;
create policy "Trade reviews are private" on public.trade_reviews for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index if not exists trade_reviews_user_created_idx on public.trade_reviews (user_id, created_at desc);
grant select, insert, delete on public.trade_reviews to authenticated;
