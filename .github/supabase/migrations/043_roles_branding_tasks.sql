-- ============================================================
-- 043_roles_branding_tasks.sql
--
-- Adds support for:
--   1. Custom Role Manager with granular permissions & assigned tags
--   2. Platform branding / Customize Design (platform name, logo, favicon, styling)
--   3. Dashboard Tasks & Alerts system connected to leads/conversations
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- 1. CUSTOM ROLES & PERMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS custom_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#8b5cf6',
  permissions JSONB NOT NULL DEFAULT '{
    "view_all_conversations": false,
    "only_assigned_conversations": true,
    "assigned_tag_ids": [],
    "can_view_contacts": true,
    "can_edit_contacts": true,
    "can_send_messages": true,
    "can_access_pipelines": true,
    "can_access_broadcasts": false,
    "can_access_automations": false,
    "can_access_flows": false,
    "can_access_ai_agents": false,
    "can_access_settings": false
  }'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_roles_account ON custom_roles(account_id);

ALTER TABLE custom_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view custom roles" ON custom_roles;
CREATE POLICY "Members can view custom roles" ON custom_roles
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Admins can manage custom roles" ON custom_roles;
CREATE POLICY "Admins can manage custom roles" ON custom_roles
  FOR ALL USING (is_account_member(account_id, 'admin'));

-- Link custom roles to profiles and invitations
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS custom_role_id UUID REFERENCES custom_roles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS custom_role_name TEXT;

ALTER TABLE account_invitations
  ADD COLUMN IF NOT EXISTS custom_role_id UUID REFERENCES custom_roles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS custom_role_name TEXT;


-- ============================================================
-- 2. ACCOUNT BRANDING / CUSTOMIZE DESIGN
-- ============================================================
CREATE TABLE IF NOT EXISTS account_branding (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  platform_name TEXT DEFAULT 'CRM Template for WhatsApp',
  logo_url TEXT,
  favicon_url TEXT,
  primary_color TEXT DEFAULT '#8b5cf6',
  settings JSONB DEFAULT '{
    "mode": "dark",
    "sidebar_theme": "default",
    "border_radius": "rounded"
  }'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_branding_account ON account_branding(account_id);

ALTER TABLE account_branding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view account branding" ON account_branding;
CREATE POLICY "Members can view account branding" ON account_branding
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Admins can manage account branding" ON account_branding;
CREATE POLICY "Admins can manage account branding" ON account_branding
  FOR ALL USING (is_account_member(account_id, 'admin'));


-- ============================================================
-- 3. TASKS & DASHBOARD ALERTS
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'GNF Tasks',
  description TEXT,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  assigned_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT 'low' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'upcoming', 'overdue', 'mentioned', 'completed', 'others')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_account_status ON tasks(account_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_user ON tasks(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_contact ON tasks(contact_id);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view tasks" ON tasks;
CREATE POLICY "Members can view tasks" ON tasks
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Agents can manage tasks" ON tasks;
CREATE POLICY "Agents can manage tasks" ON tasks
  FOR ALL USING (is_account_member(account_id, 'agent'));
