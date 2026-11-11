-- Migration 049: Deal activities audit trail for pipeline leads/deals

CREATE TABLE IF NOT EXISTS public.deal_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  actor_name TEXT NOT NULL DEFAULT 'User',
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_activities_deal_id ON public.deal_activities(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_activities_created_at ON public.deal_activities(created_at DESC);

ALTER TABLE public.deal_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view activities in account" ON public.deal_activities;
CREATE POLICY "Users can view activities in account" ON public.deal_activities
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Users can insert activities in account" ON public.deal_activities;
CREATE POLICY "Users can insert activities in account" ON public.deal_activities
  FOR INSERT WITH CHECK (is_account_member(account_id, 'viewer'));

