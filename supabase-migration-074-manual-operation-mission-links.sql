-- AEGIS 074 — operation pathways are explicit and user-controlled.
-- Run after migration 073 in the Supabase SQL editor.
-- This removes only inferred many-to-many links. It preserves operations,
-- logs, missions, and links explicitly chosen by the user.

delete from public.operation_mission_links
where is_explicit is false;

create or replace function public.aegis_sync_operation_mission_links()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Life Admin and explicitly unlinked work never advances a mission. This is
  -- the only automatic removal path; ordinary operations retain their chosen
  -- pathways across refreshes, status changes, and category edits.
  if coalesce(new.allow_unlinked, false)
    or lower(trim(coalesce(new.category, ''))) in ('life admin', 'day to day') then
    delete from public.operation_mission_links where operation_id = new.id;
    perform public.aegis_reconcile_operation_progress(new.id);
    return new;
  end if;

  -- A legacy primary link is treated as an explicit link for compatibility.
  -- No category, title, metric, newest-mission, or active-book fallback is
  -- allowed here. Users attach additional pathways in Mission Control.
  if new.mission_id is not null then
    insert into public.operation_mission_links (user_id, operation_id, mission_id, is_explicit)
    values (new.user_id, new.id, new.mission_id, true)
    on conflict (operation_id, mission_id) do update set is_explicit = true;
  end if;

  perform public.aegis_reconcile_operation_progress(new.id);
  return new;
end $$;

drop trigger if exists aegis_operation_mission_links on public.operations;
create trigger aegis_operation_mission_links
after insert or update of title, category, mission_id, metric_key, completed, allow_unlinked on public.operations
for each row execute function public.aegis_sync_operation_mission_links();

grant execute on function public.aegis_sync_operation_mission_links() to authenticated;
