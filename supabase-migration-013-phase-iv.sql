alter table public.phase_protocols
  drop constraint if exists phase_protocols_active_phase_check;

alter table public.phase_protocols
  add constraint phase_protocols_active_phase_check
  check (active_phase between 0 and 4);
