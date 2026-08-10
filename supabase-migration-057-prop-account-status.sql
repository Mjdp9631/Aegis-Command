-- AEGIS 057 — prop-firm funding status for funded-balance reporting.
-- Run after migration 056 in the Supabase SQL Editor.

alter table public.account_groups
  add column if not exists prop_status text not null default 'funded';

update public.account_groups
set prop_status = 'funded'
where prop_status is null;

update public.account_groups
set prop_status = 'pending'
where prop_status in ('challenge', 'processing', 'funding_loading');

alter table public.account_groups
  drop constraint if exists account_groups_prop_status_check;

alter table public.account_groups
  add constraint account_groups_prop_status_check
  check (prop_status in ('pending', 'funded'));

grant select, insert, update, delete on public.account_groups to authenticated;
grant all privileges on public.account_groups to service_role;
