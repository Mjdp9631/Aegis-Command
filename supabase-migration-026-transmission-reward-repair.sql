-- Repairs older transmissions created before difficulty / reward fields existed.
-- Run once after migration 025.

update public.mastery_challenges
set
  difficulty = case when difficulty is null or difficulty = '' then 'standard' else difficulty end,
  xp_reward = case
    when coalesce(xp_reward, 0) > 0 then xp_reward
    when lane = 'body' then 30
    else 35
  end,
  category = case
    when category is not null and category <> '' then category
    when lane = 'body' then 'Health'
    else 'Psychology'
  end
where coalesce(xp_reward, 0) = 0 or category is null or category = '';
