-- AEGIS 067 — allow the signed-in mission ledger to read its existing rows.
-- RLS still limits every row to the authenticated user's user_id.

grant select, insert, update, delete
on table public.missions, public.recovery_logs
to authenticated;

grant all privileges
on table public.missions, public.recovery_logs
to service_role;
