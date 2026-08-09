-- AEGIS Trade Review v2: one complete audit contains 10 named chart frames.
alter table public.trade_reviews
  drop constraint if exists trade_reviews_screenshot_count_check;

alter table public.trade_reviews
  add constraint trade_reviews_screenshot_count_check
  check (screenshot_count between 0 and 10);
