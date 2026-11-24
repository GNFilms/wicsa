
-- Migration 056: Lock default currency strictly to INR
UPDATE deals SET currency = 'INR' WHERE currency IS NULL OR currency != 'INR';
UPDATE accounts SET default_currency = 'INR' WHERE default_currency IS NULL OR default_currency != 'INR';
ALTER TABLE accounts ALTER COLUMN default_currency SET DEFAULT 'INR';
ALTER TABLE deals ALTER COLUMN currency SET DEFAULT 'INR';

-- Migration 057: Deduplicate deals per contact per pipeline
DELETE FROM deals WHERE contact_id IS NOT NULL AND id NOT IN (SELECT DISTINCT ON (contact_id, pipeline_id) id FROM deals WHERE contact_id IS NOT NULL ORDER BY contact_id, pipeline_id, updated_at DESC NULLS LAST, created_at DESC);
