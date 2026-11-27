-- Migration 058: Scheduled WhatsApp Messages
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  content_text TEXT,
  media_url TEXT,
  template_name TEXT,
  template_language TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_pending
  ON public.scheduled_messages (status, scheduled_for)
  WHERE status = 'pending';

GRANT ALL ON public.scheduled_messages TO anon, authenticated, service_role;
