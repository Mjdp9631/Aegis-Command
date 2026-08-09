-- Adds the standalone Quote entry type to the Mastery knowledge vault.
alter table public.mastery_entries
  drop constraint if exists mastery_entries_category_check;

alter table public.mastery_entries
  add constraint mastery_entries_category_check
  check (category in ('Book', 'Quote', 'Trading Note', 'Psychology', 'Space', 'Business', 'Stoicism', 'Health', 'Performance'));
