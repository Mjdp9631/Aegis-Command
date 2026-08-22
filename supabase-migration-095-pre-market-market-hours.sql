-- AEGIS 095 - keep the generated pre-market path aligned with Forex hours.
-- Forex closes Friday at 5 PM Eastern and reopens Sunday at 5 PM Eastern.
-- Preserve completed history, but remove pending daily rows on Friday/Saturday
-- so stale generated records cannot return through a cache or old rollover.

delete from public.operations
where is_daily is true
  and lower(trim(coalesce(title, ''))) = 'pre-market analysis'
  and coalesce(completed, false) is false
  and lower(coalesce(status, '')) <> 'complete'
  and extract(dow from coalesce(scheduled_date, operation_date)::date) in (5, 6);
