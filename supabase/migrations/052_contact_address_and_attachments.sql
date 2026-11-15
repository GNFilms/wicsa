-- ============================================================
-- 052_contact_address_and_attachments.sql
--
-- 1. Adds `address` text column to `contacts` table
-- 2. Creates `contact_attachments` table to store client posters,
--    pamphlets, banners, visiting cards, documents
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address TEXT;

CREATE TABLE IF NOT EXISTS contact_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'image/png',
  file_size INTEGER DEFAULT 0,
  category TEXT DEFAULT 'general',
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_attachments_contact ON contact_attachments(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_attachments_account ON contact_attachments(account_id);

ALTER TABLE contact_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view contact attachments" ON contact_attachments;
CREATE POLICY "Members can view contact attachments" ON contact_attachments
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Agents can manage contact attachments" ON contact_attachments;
CREATE POLICY "Agents can manage contact attachments" ON contact_attachments
  FOR ALL USING (is_account_member(account_id, 'agent'));
