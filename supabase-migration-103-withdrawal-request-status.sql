-- AEGIS 103 — payout requests are pending until the firm approves them.
-- Existing withdrawal records predate payout-status tracking, so they remain
-- approved to preserve the earned and balance history already recorded.

alter table public.account_group_withdrawals
  add column if not exists payout_status text,
  add column if not exists denial_reason text,
  add column if not exists status_decided_at timestamptz;

update public.account_group_withdrawals
set payout_status = 'approved'
where payout_status is null;

alter table public.account_group_withdrawals
  alter column payout_status set default 'pending',
  alter column payout_status set not null;

alter table public.account_group_withdrawals
  drop constraint if exists account_group_withdrawals_payout_status_check;

alter table public.account_group_withdrawals
  add constraint account_group_withdrawals_payout_status_check
  check (payout_status in ('pending', 'approved', 'denied'));

create index if not exists account_group_withdrawals_status_idx
  on public.account_group_withdrawals (user_id, payout_status, withdrawn_at desc);
