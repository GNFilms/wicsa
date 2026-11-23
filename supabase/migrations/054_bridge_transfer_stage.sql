-- ============================================================
-- 054_bridge_transfer_stage.sql
--
-- 1. Adds transfer / bridge configuration columns to pipeline_stages
--    is_transfer_stage: whether dropping/moving deals into this stage auto-transfers them
--    transfer_pipeline_id: target pipeline to transfer to
--    transfer_stage_id: target stage in the target pipeline
--    transfer_assignee_id: target assignee profile to assign to in the new pipeline
-- ============================================================

ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS is_transfer_stage BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS transfer_pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transfer_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transfer_assignee_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_transfer_pipeline ON pipeline_stages(transfer_pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_transfer_stage ON pipeline_stages(transfer_stage_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_transfer_assignee ON pipeline_stages(transfer_assignee_id);
