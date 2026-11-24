-- ============================================================
-- 055_ai_sub_agents.sql
--
-- Multiple specialized AI Sub-Agents for repetitive workflows
-- (e.g. Lead Qualification, Pricing & Quotation, Payment Follow-up, FAQs)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_sub_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'assistant',
  description TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'all', -- 'all', 'new_contact', 'keywords', 'manual'
  trigger_keywords TEXT[] DEFAULT '{}',
  prompt TEXT NOT NULL,
  model TEXT DEFAULT 'gpt-4o-mini',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_sub_agents_account_id ON public.ai_sub_agents(account_id);
CREATE INDEX IF NOT EXISTS idx_ai_sub_agents_is_active ON public.ai_sub_agents(is_active);

ALTER TABLE public.ai_sub_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view sub-agents" ON public.ai_sub_agents;
CREATE POLICY "Members can view sub-agents" ON public.ai_sub_agents
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Admins can manage sub-agents" ON public.ai_sub_agents;
CREATE POLICY "Admins can manage sub-agents" ON public.ai_sub_agents
  FOR ALL USING (is_account_member(account_id, 'admin'));
