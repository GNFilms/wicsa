-- ============================================================
-- 044_member_pipeline_stage_label.sql
--
-- Adds optional pipeline, stage, and label to profiles
-- for team member assignments.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pipeline_name TEXT,
  ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_name TEXT,
  ADD COLUMN IF NOT EXISTS label TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_pipeline ON profiles(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_profiles_stage ON profiles(stage_id);

