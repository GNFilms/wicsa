'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bot,
  Plus,
  Sparkles,
  Power,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  CreditCard,
  Target,
  DollarSign,
  PhoneCall,
  Loader2,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

export interface AiSubAgent {
  id: string;
  name: string;
  role: string;
  description?: string;
  trigger_type: 'all' | 'new_contact' | 'keywords' | 'manual';
  trigger_keywords: string[];
  prompt: string;
  model: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const TEMPLATES: Omit<AiSubAgent, 'id' | 'created_at' | 'updated_at'>[] = [
  {
    name: 'Lead Qualification & Intake Agent',
    role: 'Lead Qualifier',
    description: 'Greets new WhatsApp contacts, asks for their business name, requirement, and visiting card.',
    trigger_type: 'new_contact',
    trigger_keywords: [],
    model: 'gpt-4o-mini',
    is_active: true,
    prompt:
      'You are the friendly front-desk assistant for Good News Films & WICSA. Welcome the user warmly in natural Hinglish. Ask for their business or store name, what type of ad they are looking for (Audio Ad, Video Ad, or Branding), and politely request them to share their visiting card, pamphlet, or poster so we can review it.',
  },
  {
    name: 'Pricing & Quotation Specialist',
    role: 'Quotation Bot',
    description: 'Responds to price inquiries, packages, turnaround times, and sample requests.',
    trigger_type: 'keywords',
    trigger_keywords: ['price', 'rate', 'cost', 'charge', 'kitna', 'sample', 'audio', 'video'],
    model: 'gpt-4o-mini',
    is_active: true,
    prompt:
      'You are a sales & pricing assistant. When clients ask about rates or samples, explain that our Audio Ads start at ₹499 with FM quality voiceover and background music, delivered within 24 hours. Video ads depend on duration and style. Offer to send a free audio sample link and ask what business category they belong to.',
  },
  {
    name: 'Payment & Bank Details Agent',
    role: 'Payment Support',
    description: 'Shares UPI QR, bank account details, and asks for payment screenshot confirmation.',
    trigger_type: 'keywords',
    trigger_keywords: ['payment', 'pay', 'upi', 'gpay', 'phonepe', 'bank', 'qr', 'transfer', 'advance'],
    model: 'gpt-4o-mini',
    is_active: true,
    prompt:
      'You are the accounts assistant. When the client is ready to pay or asks for payment details, politely provide the business UPI ID and QR instructions. Request them to share a payment screenshot with UTR/Transaction ID once done so our team can immediately assign their project to production.',
  },
  {
    name: 'Callback & Scheduling Agent',
    role: 'Scheduler',
    description: 'Collects the best time to speak and notifies the lead manager for a call.',
    trigger_type: 'keywords',
    trigger_keywords: ['call', 'phone', 'baat', 'speak', 'meeting', 'discuss'],
    model: 'gpt-4o-mini',
    is_active: true,
    prompt:
      'You are the meeting coordinator. If the client asks for a phone call or direct meeting, ask what time would be most convenient for them today (e.g. morning, afternoon, or evening). Confirm their best contact number and inform them our senior audio/video director will call them at that time.',
  },
];

export function AiSubAgentsManager() {
  const [subAgents, setSubAgents] = useState<AiSubAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [role, setRole] = useState('assistant');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<'all' | 'new_contact' | 'keywords' | 'manual'>('all');
  const [keywordsStr, setKeywordsStr] = useState('');
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSubAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/sub-agents');
      const data = await res.json();
      if (res.ok) {
        setSubAgents(data.sub_agents || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSubAgents();
  }, [fetchSubAgents]);

  const handleOpenCreate = (template?: typeof TEMPLATES[0]) => {
    if (template) {
      setName(template.name);
      setRole(template.role);
      setDescription(template.description || '');
      setTriggerType(template.trigger_type);
      setKeywordsStr((template.trigger_keywords || []).join(', '));
      setPrompt(template.prompt);
      setModel(template.model);
      setIsActive(template.is_active);
    } else {
      setName('');
      setRole('Specialist Bot');
      setDescription('');
      setTriggerType('all');
      setKeywordsStr('');
      setPrompt('');
      setModel('gpt-4o-mini');
      setIsActive(true);
    }
    setEditingId(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (agent: AiSubAgent) => {
    setEditingId(agent.id);
    setName(agent.name);
    setRole(agent.role);
    setDescription(agent.description || '');
    setTriggerType(agent.trigger_type);
    setKeywordsStr((agent.trigger_keywords || []).join(', '));
    setPrompt(agent.prompt);
    setModel(agent.model || 'gpt-4o-mini');
    setIsActive(agent.is_active);
    setModalOpen(true);
  };

  const handleToggleActive = async (agent: AiSubAgent) => {
    const nextState = !agent.is_active;
    // Optimistic
    setSubAgents((prev) =>
      prev.map((a) => (a.id === agent.id ? { ...a, is_active: nextState } : a))
    );

    try {
      const res = await fetch('/api/ai/sub-agents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: agent.id, is_active: nextState }),
      });
      if (res.ok) {
        toast.success(
          nextState
            ? `Activated "${agent.name}"`
            : `Deactivated "${agent.name}"`
        );
      } else {
        fetchSubAgents();
      }
    } catch {
      fetchSubAgents();
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !prompt.trim()) {
      toast.error('Name and Prompt instructions are required');
      return;
    }

    const keywords = keywordsStr
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    setSaving(true);
    try {
      const method = editingId ? 'PUT' : 'POST';
      const body = {
        id: editingId,
        name: name.trim(),
        role: role.trim(),
        description: description.trim(),
        trigger_type: triggerType,
        trigger_keywords: keywords,
        prompt: prompt.trim(),
        model,
        is_active: isActive,
      };

      const res = await fetch('/api/ai/sub-agents', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(editingId ? 'Sub-Agent updated' : 'Sub-Agent created');
        setModalOpen(false);
        fetchSubAgents();
      } else {
        toast.error(data.error || 'Failed to save sub-agent');
      }
    } catch {
      toast.error('Network error saving sub-agent');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, agentName: string) => {
    if (!confirm(`Are you sure you want to delete "${agentName}"?`)) return;
    try {
      const res = await fetch(`/api/ai/sub-agents?id=${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success('Sub-Agent deleted');
        setSubAgents((prev) => prev.filter((a) => a.id !== id));
      } else {
        toast.error('Failed to delete sub-agent');
      }
    } catch {
      toast.error('Network error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/30 border border-border/60 p-4 rounded-xl">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Bot className="size-5 text-primary" />
            Specialized Micro-Agents & Sub-Bots
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Create small, dedicated agents to handle specific repetitive tasks (lead qualification, pricing, payment follow-up, FAQs).
          </p>
        </div>
        <Button
          onClick={() => handleOpenCreate()}
          size="sm"
          className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 shrink-0"
        >
          <Plus className="size-4" />
          Create Sub-Agent
        </Button>
      </div>

      {/* Starter Templates (Quick Add) */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
          Starter Templates (Click to Add)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {TEMPLATES.map((tmpl, idx) => (
            <div
              key={idx}
              onClick={() => handleOpenCreate(tmpl)}
              className="group cursor-pointer rounded-xl border border-border/60 bg-card p-3.5 hover:border-primary/50 hover:bg-muted/40 transition-all shadow-xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                  {tmpl.name}
                </span>
                <Plus className="size-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                {tmpl.description}
              </p>
              <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-primary font-medium">
                <Sparkles className="size-2.5" />
                <span>Use Template</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* List of Created Sub-Agents */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
          Active Workspace Sub-Agents ({subAgents.length})
        </h3>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-xs text-muted-foreground gap-2">
            <Loader2 className="size-4 animate-spin text-primary" />
            <span>Loading sub-agents...</span>
          </div>
        ) : subAgents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-12 text-center text-xs text-muted-foreground space-y-2">
            <Bot className="size-8 mx-auto text-muted-foreground opacity-50" />
            <p className="font-medium text-foreground">No custom sub-agents created yet</p>
            <p className="text-[11px]">Pick a starter template above or click &quot;Create Sub-Agent&quot; to build your first one.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {subAgents.map((agent) => (
              <div
                key={agent.id}
                className={`rounded-xl border transition-all p-4 space-y-3 ${
                  agent.is_active
                    ? 'border-border bg-card shadow-xs'
                    : 'border-border/40 bg-muted/20 opacity-75'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-foreground truncate">
                        {agent.name}
                      </h4>
                      <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[10px] font-medium shrink-0">
                        {agent.role}
                      </span>
                    </div>
                    {agent.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {agent.description}
                      </p>
                    )}
                  </div>

                  {/* Active / Deactivate Toggle Button */}
                  <Button
                    size="sm"
                    variant={agent.is_active ? 'default' : 'outline'}
                    onClick={() => handleToggleActive(agent)}
                    className={`h-7 px-2.5 text-xs gap-1.5 shrink-0 ${
                      agent.is_active
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Power className="size-3.5" />
                    <span>{agent.is_active ? 'Active' : 'Deactivated'}</span>
                  </Button>
                </div>

                {/* Trigger information pill */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-muted-foreground">Trigger:</span>
                  {agent.trigger_type === 'all' && (
                    <span className="rounded bg-muted px-2 py-0.5 text-foreground font-medium">
                      All Inbound Messages
                    </span>
                  )}
                  {agent.trigger_type === 'new_contact' && (
                    <span className="rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-2 py-0.5 font-medium">
                      First Message (New Leads Only)
                    </span>
                  )}
                  {agent.trigger_type === 'keywords' && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-2 py-0.5 font-medium">
                        Keywords Match
                      </span>
                      {agent.trigger_keywords?.map((k, i) => (
                        <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {k}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Prompt instructions preview */}
                <div className="rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground line-clamp-3 font-mono text-[11px] leading-relaxed">
                  {agent.prompt}
                </div>

                {/* Actions bottom bar */}
                <div className="flex items-center justify-between pt-1 border-t border-border/50 text-xs">
                  <span className="text-[10px] text-muted-foreground">
                    Model: {agent.model || 'OpenAI gpt-4o-mini'}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOpenEdit(agent)}
                      className="h-7 text-xs gap-1 px-2 text-muted-foreground hover:text-foreground"
                    >
                      <Edit2 className="size-3" />
                      <span>Edit</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(agent.id, agent.name)}
                      className="h-7 text-xs gap-1 px-2 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
                    >
                      <Trash2 className="size-3" />
                      <span>Delete</span>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Sub-Agent Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <Bot className="size-4 text-primary" />
              {editingId ? 'Edit Sub-Agent' : 'Create Specialized Sub-Agent'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-foreground">
                  Agent Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Pricing & Quotation Bot"
                  className="h-8 text-xs bg-background"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-foreground">Specialty Role</Label>
                <Input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Sales Specialist"
                  className="h-8 text-xs bg-background"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium text-foreground">Description / Purpose</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this sub-agent do?"
                className="h-8 text-xs bg-background"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-foreground">Trigger Condition</Label>
                <select
                  value={triggerType}
                  onChange={(e) => setTriggerType(e.target.value as any)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="all">All Inbound Messages</option>
                  <option value="new_contact">New Leads Only (1st Message)</option>
                  <option value="keywords">When Message Contains Keywords</option>
                  <option value="manual">Manual Inbox Delegation Only</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-foreground">OpenAI Model</Label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="gpt-4o-mini">OpenAI GPT-4o Mini (Fast & Cost Effective)</option>
                  <option value="gpt-4o">OpenAI GPT-4o (High Reasoning)</option>
                </select>
              </div>
            </div>

            {triggerType === 'keywords' && (
              <div className="space-y-1">
                <Label className="text-xs font-medium text-foreground">
                  Trigger Keywords (comma separated)
                </Label>
                <Input
                  value={keywordsStr}
                  onChange={(e) => setKeywordsStr(e.target.value)}
                  placeholder="e.g. price, rate, audio, video, cost, sample"
                  className="h-8 text-xs bg-background"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs font-medium text-foreground">
                Prompt & Instructions <span className="text-red-500">*</span>
              </Label>
              <Textarea
                rows={5}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Teach this agent how to speak, what questions to ask, pricing rules, and what details to gather..."
                className="text-xs bg-background resize-none leading-relaxed"
              />
              <p className="text-[10px] text-muted-foreground">
                Tip: You can instruct it to speak in friendly Hinglish, ask for visiting cards, give pricing quotes, or share UPI details.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-2.5">
              <div>
                <Label className="text-xs font-medium text-foreground">Enable this Sub-Agent</Label>
                <p className="text-[10px] text-muted-foreground">When enabled, this agent will respond automatically based on its trigger condition.</p>
              </div>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={saving || !name.trim() || !prompt.trim()}
              onClick={handleSave}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {saving ? 'Saving...' : editingId ? 'Update Agent' : 'Create Agent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
