-- ============================================================
-- 053_profiles_multiple_pipelines.sql
--
-- Supports multiple pipeline assignments per team member
-- by storing primary pipeline in pipeline_id and comma-separated
-- names in pipeline_name, or updating column types as needed.
-- ============================================================

-- Ensure pipeline_name column exists
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pipeline_name TEXT;
