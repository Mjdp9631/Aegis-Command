-- AEGIS 090 - preserve intentional mission-count corrections.
--
-- Historical completion reconciliation is useful for legacy PT records, but
-- it must never replace a count the director explicitly edits. The app sets
-- this flag whenever a measured mission's completed count is changed in the
-- mission editor. New operation completions still add to that corrected base.

alter table public.missions
  add column if not exists manual_progress_override boolean not null default false;
