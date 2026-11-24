'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, Sparkles, Settings2, BarChart3, Power, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { AiPlayground } from '@/components/agents/ai-playground';
import { AiUsageCard } from '@/components/agents/ai-usage';
import { AiConfig } from '@/components/settings/ai-config';
import { AiSubAgentsManager } from '@/components/agents/ai-sub-agents-manager';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';
import { toast } from 'sonner';

type Tab = 'playground' | 'sub-agents' | 'setup' | 'usage';

export default function AgentsPage() {
  const t = useTranslations('Agents');
  const { accountRole } = useAuth();
  const canViewUsage = accountRole ? canEditSettings(accountRole) : false;
  const canEdit = accountRole ? canEditSettings(accountRole) : false;
  const [tab, setTab] = useState<Tab>('playground');
  const [decided, setDecided] = useState(false);
  const [isAiActive, setIsAiActive] = useState<boolean>(false);
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [toggling, setToggling] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/config');
      const data = await res.json().catch(() => ({}));
      setIsConfigured(Boolean(data?.configured));
      setIsAiActive(Boolean(data?.is_active));
      return data;
    } catch {
      return null;
    }
  }, []);

  // Land first-time users on Setup, returning users on the Playground.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchConfig();
        if (!cancelled) setTab(data?.configured ? 'playground' : 'setup');
      } catch {
        if (!cancelled) setTab('setup');
      } finally {
        if (!cancelled) setDecided(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchConfig]);

  const handleToggleActive = async () => {
    if (!isConfigured) {
      toast.error('Please configure your OpenAI API Key first under Setup.');
      setTab('setup');
      return;
    }
    setToggling(true);
    const nextState = !isAiActive;
    try {
      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_active: nextState,
          auto_reply_enabled: nextState,
        }),
      });
      if (res.ok) {
        setIsAiActive(nextState);
        toast.success(
          nextState
            ? '🟢 AI Agent is now ACTIVE and responding to incoming messages!'
            : '⚪ AI Agent has been PAUSED and deactivated.'
        );
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to toggle AI agent state');
      }
    } catch {
      toast.error('Network error updating AI status');
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Title and Live Activation Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t('title')}
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('description')}
          </p>
        </div>

        {/* Master AI Agent Active / Deactivate Power Toggle */}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-2 sm:p-2.5 shadow-sm">
          <div className="flex items-center gap-2 pl-2">
            <span
              className={`h-2.5 w-2.5 rounded-full animate-pulse ${
                isAiActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-muted-foreground/50'
              }`}
            />
            <div className="text-xs">
              <p className="font-semibold text-foreground">
                {isAiActive ? 'AI Agent: ACTIVE' : 'AI Agent: PAUSED'}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {isAiActive ? 'Auto-replies running' : 'Inbox manual replies only'}
              </p>
            </div>
          </div>

          {canEdit && (
            <Button
              size="sm"
              variant={isAiActive ? 'destructive' : 'default'}
              disabled={toggling}
              onClick={handleToggleActive}
              className="gap-1.5 font-medium text-xs ml-2"
            >
              {toggling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Power className="h-3.5 w-3.5" />
              )}
              {isAiActive ? 'Deactivate Agent' : 'Activate Agent'}
            </Button>
          )}
        </div>
      </div>

      {decided && (
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
            <TabsTrigger value="playground">
              <Sparkles className="mr-1.5 h-4 w-4" /> {t('tabPlayground')}
            </TabsTrigger>
            <TabsTrigger value="sub-agents">
              <Bot className="mr-1.5 h-4 w-4 text-primary" /> Sub-Agents / Micro-Bots
            </TabsTrigger>
            <TabsTrigger value="setup">
              <Settings2 className="mr-1.5 h-4 w-4" /> {t('tabSetup')}
            </TabsTrigger>
            {canViewUsage && (
              <TabsTrigger value="usage">
                <BarChart3 className="mr-1.5 h-4 w-4" /> {t('tabUsage')}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="playground" className="mt-4">
            <AiPlayground onGoToSetup={() => setTab('setup')} />
          </TabsContent>

          <TabsContent value="sub-agents" className="mt-4">
            <AiSubAgentsManager />
          </TabsContent>

          <TabsContent value="setup" className="mt-4">
            <AiConfig />
          </TabsContent>

          {canViewUsage && (
            <TabsContent value="usage" className="mt-4">
              <AiUsageCard />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
