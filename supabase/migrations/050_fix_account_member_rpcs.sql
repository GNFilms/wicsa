-- ============================================================
-- 050_fix_account_member_rpcs.sql
--
-- Fix remove_account_member to handle existing personal accounts
-- gracefully and clean up role & pipeline assignment foreign references.
-- ============================================================

CREATE OR REPLACE FUNCTION public.remove_account_member(
  p_user_id UUID
) RETURNS UUID  -- the personal account id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_account_id UUID;
  v_caller_role account_role_enum;
  v_target_account_id UUID;
  v_target_role account_role_enum;
  v_target_name TEXT;
  v_target_email TEXT;
  v_new_account_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT account_id, account_role
  INTO v_caller_account_id, v_caller_role
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'This action requires the admin role or higher'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot remove yourself; transfer ownership or leave the account instead'
      USING ERRCODE = '22023';
  END IF;

  SELECT account_id, account_role, full_name, email
  INTO v_target_account_id, v_target_role, v_target_name, v_target_email
  FROM profiles
  WHERE user_id = p_user_id;

  IF v_target_account_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = '22023';
  END IF;

  IF v_target_account_id <> v_caller_account_id THEN
    RAISE EXCEPTION 'Target user is not a member of your account'
      USING ERRCODE = '42501';
  END IF;

  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot remove the account owner; transfer ownership first'
      USING ERRCODE = '22023';
  END IF;

  -- 1. Check if user already owns an existing personal account
  SELECT id INTO v_new_account_id
  FROM accounts
  WHERE owner_user_id = p_user_id
  LIMIT 1;

  -- 2. If none exists, create a fresh personal account
  IF v_new_account_id IS NULL THEN
    INSERT INTO accounts (name, owner_user_id)
    VALUES (
      COALESCE(NULLIF(v_target_name, ''), v_target_email, 'Personal Account'),
      p_user_id
    )
    RETURNING id INTO v_new_account_id;
  END IF;

  -- 3. Move profile to personal account and reset pipeline/stage/custom role
  UPDATE profiles
  SET account_id = v_new_account_id,
      account_role = 'owner',
      custom_role_id = NULL,
      custom_role_name = NULL,
      pipeline_id = NULL,
      pipeline_name = NULL,
      stage_id = NULL,
      stage_name = NULL,
      label = NULL,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- 4. Clean up active presence in current account
  DELETE FROM member_presence WHERE user_id = p_user_id;

  RETURN v_new_account_id;
END;
$$;

ALTER FUNCTION public.remove_account_member(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.remove_account_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_account_member(UUID) TO authenticated;

