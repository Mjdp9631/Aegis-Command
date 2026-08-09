-- AEGIS 050 — store the quantity and provenance for estimated nutrition.
-- Run once in Supabase SQL Editor.

alter table public.health_food_logs
  add column if not exists quantity_text text,
  add column if not exists carbs_g numeric,
  add column if not exists estimate_source text,
  add column if not exists estimated_at timestamptz;
