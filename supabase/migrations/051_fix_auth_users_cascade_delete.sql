-- ============================================================
-- 051_fix_auth_users_cascade_delete.sql
--
-- Fixes foreign key constraints on tables referencing auth.users(id)
-- so that users can be deleted from Supabase Auth dashboard or API
-- without hitting "Database error deleting user".
-- ============================================================

-- 1. accounts.owner_user_id was ON DELETE RESTRICT!
-- Change it to ON DELETE CASCADE so deleting an auth user removes their owned accounts.
ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_owner_user_id_fkey;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_owner_user_id_fkey
  FOREIGN KEY (owner_user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;

-- 2. Ensure pipeline_stages.default_assignee_id and deals.assigned_to are nullified if target profile is removed
ALTER TABLE public.pipeline_stages
  DROP CONSTRAINT IF EXISTS pipeline_stages_default_assignee_id_fkey;

ALTER TABLE public.pipeline_stages
  ADD CONSTRAINT pipeline_stages_default_assignee_id_fkey
  FOREIGN KEY (default_assignee_id)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;

ALTER TABLE public.deals
  DROP CONSTRAINT IF EXISTS deals_assigned_to_fkey;

ALTER TABLE public.deals
  ADD CONSTRAINT deals_assigned_to_fkey
  FOREIGN KEY (assigned_to)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- 3. In case any conversations or activities reference auth.users without ON DELETE SET NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'conversations_assigned_agent_id_fkey'
  ) THEN
    ALTER TABLE public.conversations DROP CONSTRAINT conversations_assigned_agent_id_fkey;
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_assigned_agent_id_fkey
      FOREIGN KEY (assigned_agent_id)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

