-- Ensure the browser's authenticated Supabase role can use the account ledger.
-- RLS still limits every row to the signed-in user's own data.

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.account_balances to authenticated;
grant select, insert, update, delete on public.account_groups to authenticated;
grant select, insert, update, delete on public.account_group_memberships to authenticated;
grant select, insert, update, delete on public.account_group_trade_links to authenticated;
grant select, insert, update, delete on public.account_group_withdrawals to authenticated;
grant select, insert, update, delete on public.account_group_withdrawal_allocations to authenticated;

grant execute on function public.validate_account_group_type() to authenticated;
grant execute on function public.prevent_account_type_change_with_membership() to authenticated;
grant execute on function public.prevent_group_type_change_with_membership() to authenticated;

alter table public.account_balances enable row level security;
drop policy if exists "Account balances are private" on public.account_balances;
create policy "Account balances are private" on public.account_balances for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
