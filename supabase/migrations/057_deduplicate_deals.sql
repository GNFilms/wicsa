-- Migration 057: Deduplicate deals so each contact has only their latest active deal per pipeline
-- Removes historical duplicates created when updating stages
DELETE FROM deals 
WHERE contact_id IS NOT NULL 
AND id NOT IN (
  SELECT DISTINCT ON (contact_id, pipeline_id) id 
  FROM deals 
  WHERE contact_id IS NOT NULL 
  ORDER BY contact_id, pipeline_id, updated_at DESC NULLS LAST, created_at DESC
);
