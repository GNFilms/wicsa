-- ============================================================
-- 046_pipeline_stage_assignee_and_custom_fields.sql
--
-- 1. Adds default_assignee_id to pipeline_stages
-- 2. Adds default_assignee_id to deals auto-assignment
-- 3. Adds field_type and field_options to custom_fields (if not exists)
-- ============================================================

ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS default_assignee_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_default_assignee ON pipeline_stages(default_assignee_id);

ALTER TABLE custom_fields
  ADD COLUMN IF NOT EXISTS field_type TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS field_options JSONB DEFAULT '[]'::jsonb;

