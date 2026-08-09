-- Replace the old mission labels with Eisenhower Matrix priorities.
alter table public.missions
  drop constraint if exists missions_priority_check;

update public.missions
set priority = case
  when priority in ('Non-negotiable', 'High') then 'Do now'
  when priority = 'Strategic' then 'Schedule'
  else 'Schedule'
end;

alter table public.missions
  add constraint missions_priority_check
  check (priority in ('Do now', 'Schedule', 'Delegate', 'Eliminate'));
