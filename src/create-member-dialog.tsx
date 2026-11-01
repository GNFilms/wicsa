'use client';

// ============================================================
// CreateMemberDialog
//
// Direct member creation modal:
//   - Name (required)
//   - Email (required)
//   - Password (required)
//   - Role (required - System or Custom Role)
//   - Pipeline (optional)
//   - Stage (optional - filtered by selected pipeline)
//   - Label (optional)
//
// Creates the member credentials directly in the database
// via POST /api/account/members and links them to the active account.
// ============================================================

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import type { CustomRole } from '@/types';

interface CreateMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  customRoles?: CustomRole[];
}

interface PipelineOption {
  id: string;
  name: string;
}

interface StageOption {
  id: string;
  name: string;
  pipeline_id: string;
}

interface TagOption {
  id: string;
  name: string;
  color?: string | null;
}

export function CreateMemberDialog({
  open,
  onOpenChange,
  onCreated,
  customRoles = [],
}: CreateMemberDialogProps) {
  const tRoles = useTranslations('Settings.roles');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('agent');
  const [selectedPipeline, setSelectedPipeline] = useState<string>('none');
  const [selectedStage, setSelectedStage] = useState<string>('none');
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [stages, setStages] = useState<StageOption[]>([]);
  const [existingTags, setExistingTags] = useState<TagOption[]>([]);

  // Fetch pipelines, stages, and tags when the modal opens
  useEffect(() => {
    if (!open) return;

    let mounted = true;
    const supabase = createClient();

    async function loadMetadata() {
      try {
        const [pipesRes, stagesRes, tagsRes] = await Promise.all([
          supabase.from('pipelines').select('id, name').order('name'),
          supabase.from('pipeline_stages').select('id, name, pipeline_id').order('position'),
          supabase.from('tags').select('id, name, color').order('name'),
        ]);

        if (mounted) {
          if (pipesRes.data) setPipelines(pipesRes.data);
          if (stagesRes.data) setStages(stagesRes.data);
          if (tagsRes.data) setExistingTags(tagsRes.data);
        }
      } catch (err) {
        console.warn('[CreateMemberDialog] Failed to fetch pipeline metadata:', err);
      }
    }

    void loadMetadata();

    return () => {
      mounted = false;
    };
  }, [open]);

  function reset() {
    setName('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setSelectedRole('agent');
    setSelectedPipeline('none');
    setSelectedStage('none');
    setLabel('');
    setSubmitting(false);
  }

  const filteredStages =
    selectedPipeline && selectedPipeline !== 'none'
      ? stages.filter((s) => s.pipeline_id === selectedPipeline)
      : [];

  async function handleCreate() {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPassword = password;
    const trimmedLabel = label.trim();

    if (!trimmedName) {
      toast.error('Please enter a name for the member');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (!trimmedPassword || trimmedPassword.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    setSubmitting(true);
    try {
      const isCustom = selectedRole.startsWith('custom:');
      const customRoleId = isCustom ? selectedRole.replace('custom:', '') : null;
      const pickedCustom = isCustom
        ? customRoles.find((r) => r.id === customRoleId)
        : null;

      const baseRole = isCustom ? 'agent' : selectedRole;

      const pickedPipeline =
        selectedPipeline && selectedPipeline !== 'none'
          ? pipelines.find((p) => p.id === selectedPipeline)
          : null;

      const pickedStage =
        selectedStage && selectedStage !== 'none'
          ? stages.find((s) => s.id === selectedStage)
          : null;

      const res = await fetch('/api/account/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          password: trimmedPassword,
          role: baseRole,
          custom_role_id: customRoleId,
          custom_role_name: pickedCustom?.name || undefined,
          pipeline_id: pickedPipeline ? pickedPipeline.id : null,
          pipeline_name: pickedPipeline ? pickedPipeline.name : null,
          stage_id: pickedStage ? pickedStage.id : null,
          stage_name: pickedStage ? pickedStage.name : null,
          label: trimmedLabel || undefined,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Failed to create member');
        return;
      }

      toast.success(`Member "${trimmedName}" created successfully!`);
      reset();
      onCreated();
      onOpenChange(false);
    } catch (err) {
      console.error('[CreateMemberDialog] create error:', err);
      toast.error('Could not connect to the server');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="bg-popover border-border sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-popover-foreground">
            <UserPlus className="size-5 text-primary" />
            Create Member
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Add a new team member with direct login credentials. They will immediately have access to this account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="e.g. Shruti Sharma"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-muted border-border text-foreground text-sm"
              disabled={submitting}
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">
              Email <span className="text-red-500">*</span>
            </Label>
            <Input
              type="email"
              placeholder="e.g. member@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-muted border-border text-foreground text-sm"
              disabled={submitting}
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">
              Password <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-muted border-border text-foreground pr-10 text-sm"
                disabled={submitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Provide an initial password for the teammate to sign in.
            </p>
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">
              Role <span className="text-red-500">*</span>
            </Label>
            <Select
              value={selectedRole}
              onValueChange={(v) => v && setSelectedRole(v)}
              disabled={submitting}
            >
              <SelectTrigger className="w-full bg-muted border-border text-foreground text-sm">
                <SelectValue>
                  {selectedRole.startsWith('custom:')
                    ? customRoles.find((r) => r.id === selectedRole.replace('custom:', ''))?.name || 'Custom Role'
                    : tRoles(selectedRole as 'admin' | 'agent' | 'viewer')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  System Roles
                </div>
                <SelectItem value="admin">{tRoles('admin')}</SelectItem>
                <SelectItem value="agent">{tRoles('agent')}</SelectItem>
                <SelectItem value="viewer">{tRoles('viewer')}</SelectItem>
                {customRoles.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground border-t border-border mt-1 uppercase tracking-wider">
                      Custom Roles
                    </div>
                    {customRoles.map((cr) => (
                      <SelectItem key={cr.id} value={`custom:${cr.id}`}>
                        <span className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full inline-block"
                            style={{ backgroundColor: cr.color || '#8b5cf6' }}
                          />
                          {cr.name}
                        </span>
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {selectedRole.startsWith('custom:')
                ? customRoles.find((r) => r.id === selectedRole.replace('custom:', ''))?.description ||
                  'Custom permissions with assigned leads & tags'
                : tRoles(`${selectedRole}Hint` as 'adminHint' | 'agentHint' | 'viewerHint')}
            </p>
          </div>

          {/* Optional Pipeline, Stage, Label Section */}
          <div className="pt-2 border-t border-border/60 space-y-3.5">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Assignment & Categorization (Optional)
            </p>

            {/* Pipeline */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground flex items-center justify-between">
                <span>Pipeline</span>
                <span className="text-[11px] text-muted-foreground font-normal">(Optional)</span>
              </Label>
              <Select
                value={selectedPipeline}
                onValueChange={(v) => {
                  setSelectedPipeline(v || 'none');
                  setSelectedStage('none');
                }}
                disabled={submitting}
              >
                <SelectTrigger className="w-full bg-muted border-border text-foreground text-sm">
                  <SelectValue placeholder="Select a pipeline..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {pipelines.map((pipe) => (
                    <SelectItem key={pipe.id} value={pipe.id}>
                      {pipe.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Stage */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground flex items-center justify-between">
                <span>Stage</span>
                <span className="text-[11px] text-muted-foreground font-normal">(Optional)</span>
              </Label>
              <Select
                value={selectedStage}
                onValueChange={(v) => setSelectedStage(v || 'none')}
                disabled={submitting || selectedPipeline === 'none' || filteredStages.length === 0}
              >
                <SelectTrigger className="w-full bg-muted border-border text-foreground text-sm">
                  <SelectValue
                    placeholder={
                      selectedPipeline === 'none'
                        ? 'Select a pipeline first'
                        : filteredStages.length === 0
                        ? 'No stages in this pipeline'
                        : 'Select a stage...'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {filteredStages.map((stg) => (
                    <SelectItem key={stg.id} value={stg.id}>
                      {stg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Label */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground flex items-center justify-between">
                <span>Label</span>
                <span className="text-[11px] text-muted-foreground font-normal">(Optional)</span>
              </Label>
              <Input
                placeholder="e.g. Sales, Lead Qualifier, Support..."
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="bg-muted border-border text-foreground text-sm"
                disabled={submitting}
              />
              {existingTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[10px] text-muted-foreground self-center mr-1">Quick pick:</span>
                  {existingTags.slice(0, 6).map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => setLabel(tag.name)}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                    >
                      {tag.color && (
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                      )}
                      {tag.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="bg-popover border-border pt-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={submitting}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium gap-1.5"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Creating Member...
              </>
            ) : (
              <>
                <UserPlus className="size-4" />
                Create Member
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

