alter table public.mastery_challenges
  add column if not exists research_definition text,
  add column if not exists research_personal_meaning text,
  add column if not exists research_application text,
  add column if not exists ai_assessment jsonb;
