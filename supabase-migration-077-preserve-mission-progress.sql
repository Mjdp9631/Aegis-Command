-- AEGIS 077 — preserve mission counters during pathway reconciliation
--
-- Migration 076 rebuilt the counter from the currently visible operation
-- evidence. That can lower a mission that already had legitimate progress
-- (for example 14/15) when only one completed operation row is available.
-- This migration makes reconciliation incremental and idempotent: existing
-- mission progress is never lowered, and each newly inserted completed
-- operation/occurrence event adds exactly one unit.

create or replace function public.aegis_clean_reconcile_mission(
  p_user_id uuid,
  p_mission_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mission public.missions%rowtype;
  v_link record;
  v_inserted uuid;
  v_added integer := 0;
  v_next integer;
begin
  select * into v_mission
  from public.missions
  where id = p_mission_id and user_id = p_user_id;
  if not found then return; end if;

  -- A completed one-time operation is one unit. A recurring parent is a
  -- schedule; its completed occurrences are the units. Existing events are
  -- left in place, so a repeated refresh cannot award another unit.
  for v_link in
    select o.id, greatest(1, coalesce(o.mission_increment, 1)) as amount
    from public.operations o
    where o.user_id = p_user_id
      and o.completed is true
      and not exists (select 1 from public.operation_occurrences oo where oo.operation_id = o.id)
      and exists (
        select 1 from public.operation_family_mission_links l
        where l.user_id = p_user_id
          and l.mission_id = p_mission_id
          and l.operation_family_key = o.operation_family_key
      )
  loop
    v_inserted := null;
    insert into public.mission_progress_events (user_id, mission_id, operation_id, amount)
    values (p_user_id, p_mission_id, v_link.id, v_link.amount)
    on conflict do nothing
    returning id into v_inserted;
    if v_inserted is not null then
      v_added := v_added + v_link.amount;
    end if;
  end loop;

  for v_link in
    select oo.id, oo.operation_id
    from public.operation_occurrences oo
    join public.operations o on o.id = oo.operation_id and o.user_id = oo.user_id
    where oo.user_id = p_user_id
      and oo.completed is true
      and exists (
        select 1 from public.operation_family_mission_links l
        where l.user_id = p_user_id
          and l.mission_id = p_mission_id
          and l.operation_family_key = o.operation_family_key
      )
  loop
    v_inserted := null;
    insert into public.mission_progress_events (user_id, mission_id, operation_id, occurrence_id, amount)
    values (p_user_id, p_mission_id, v_link.operation_id, v_link.id, 1)
    on conflict do nothing
    returning id into v_inserted;
    if v_inserted is not null then
      v_added := v_added + 1;
    end if;
  end loop;

  -- Never replace a legitimate stored count with the number of rows visible
  -- to the current browser. Only new idempotent events can move it upward.
  v_next := least(coalesce(v_mission.target_count, 2147483647), greatest(0, coalesce(v_mission.completed_count, 0)) + v_added);
  update public.missions
  set completed_count = case when completion_type = 'units' then v_next else completed_count end,
      progress = case
        when completion_type = 'units' and coalesce(target_count, 0) > 0
          then round((v_next::numeric / target_count::numeric) * 100)::integer
        else progress
      end,
      completed = case
        when completion_type = 'units' then v_next >= coalesce(target_count, 1)
        else completed
      end
  where id = p_mission_id and user_id = p_user_id;

  if v_next >= coalesce(v_mission.target_count, 1) then
    delete from public.operation_family_mission_links
    where user_id = p_user_id and mission_id = p_mission_id;
  end if;
end;
$$;

grant execute on function public.aegis_clean_reconcile_mission(uuid, uuid) to authenticated;

-- The user confirmed this exact state before migration 076: the active
-- Think and Grow Rich mission was 14/15, and the just-completed reading unit
-- was the fifteenth. Restore that lost state once, then let the normal
-- completion rule detach its pathway.
update public.missions
set completed_count = target_count,
    progress = 100,
    completed = true
where lower(title) like '%think and grow rich%'
  and completion_type = 'units'
  and target_count = 15
  and coalesce(completed_count, 0) <= 1
  and completed is false;

delete from public.operation_family_mission_links
where mission_id in (
  select id from public.missions
  where lower(title) like '%think and grow rich%'
    and completion_type = 'units'
    and target_count = 15
    and completed is true
);

