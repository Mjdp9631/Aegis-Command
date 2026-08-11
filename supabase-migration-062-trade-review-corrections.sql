-- AEGIS 062 — durable human corrections for AI trade reviews.
-- The original review remains immutable; corrections are labeled feedback.

create table if not exists public.trade_review_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trade_review_id uuid references public.trade_reviews(id) on delete cascade,
  trade_id uuid references public.trade_debriefs(id) on delete cascade,
  correction_area text not null check (correction_area in ('Stop placement', 'Entry model', 'Both', 'Condition', 'Location', 'Confirmation', 'Other')),
  correction text not null check (char_length(correction) between 1 and 4000),
  chart_evidence text,
  created_at timestamptz not null default now()
);

create index if not exists trade_review_corrections_user_created_idx on public.trade_review_corrections (user_id, created_at desc);
create index if not exists trade_review_corrections_trade_idx on public.trade_review_corrections (trade_id, created_at desc);

alter table public.trade_review_corrections enable row level security;
drop policy if exists "Trade review corrections are private" on public.trade_review_corrections;
create policy "Trade review corrections are private" on public.trade_review_corrections for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.trade_review_corrections to authenticated;
