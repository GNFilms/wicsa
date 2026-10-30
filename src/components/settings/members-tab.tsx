'use client';

// ============================================================
// MembersTab — Settings → Members
//
// Two stacked sections:
//   1. Roster   — every member of the account. Admin+ can change a
//                 teammate's role inline and remove them. Owner row
//                 is non-editable everywhere (transfer is its own
//                 separate flow, deferred to a later PR).
//   2. Pending  — outstanding invite links. Admin+ can revoke. The
//                 plaintext URL is gone after the create dialog
//                 closes, so we surface a "revoke + new link" hint
//                 rather than pretending we can resurface it.
//
// Role-gating
//   The tab itself is reachable by any member, but mutation buttons
//   are wrapped in `<RequireRole min="admin">` / `useCan` so an
//   agent or viewer sees the roster read-only. The server-side
//   RPCs (set_member_role, remove_account_member) double-check
//   the role anyway.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Loader2,
  Mail,
  MailX,
  Plus,
  Trash2,
  UsersRound,
  UserPlus,
  Kanban,
  Tag,
} from 'lucide-react';

import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslations } from 'next-intl';
import { RequireRole } from '@/components/auth/require-role';
import { useAuth } from '@/hooks/use-auth';
import { usePresence } from '@/hooks/use-presence';
import type { AccountRole } from '@/lib/auth/roles';
import { presenceLabel, summarize } from '@/lib/presence';
import {
  PRESENCE_DOT_CLASS,
  PresenceDot,
} from '@/components/presence/presence-dot';
import { InviteMemberDialog } from './invite-member-dialog';
import { CreateMemberDialog } from './create-member-dialog';
import { SettingsPanelHead } from './settings-panel-head';
import { ROLE_META } from './role-meta';
import type { CustomRole } from '@/types';
import { ShieldCheck } from 'lucide-react';

interface Member {
  user_id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  role: AccountRole;
  custom_role_id?: string | null;
  custom_role_name?: string | null;
  pipeline_id?: string | null;
  pipeline_name?: string | null;
  stage_id?: string | null;
  stage_name?: string | null;
  label?: string | null;
  joined_at: string;
}

interface Invitation {
  id: string;
  role: 'admin' | 'agent' | 'viewer';
  custom_role_id?: string | null;
  custom_role_name?: string | null;
  label: string | null;
  created_at: string;
  expires_at: string;
}

// These roles are translated via `useTranslations("Settings.roles")` where they are used.
const EDITABLE_ROLES: { value: AccountRole }[] = [
  { value: 'admin' },
  { value: 'agent' },
  { value: 'viewer' },
];

interface MembersTabProps {
  onGoToRoles?: () => void;
}

function fmtDate(iso: string): string {
  // Match the rest of the dashboard's locale-light formatting.
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function fmtExpiresIn(iso: string, t: (key: string, values?: Record<string, string | number>) => string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return t('expired');
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return t('expiresInDays', { days });
  const hours = Math.max(1, Math.floor(ms / (60 * 60 * 1000)));
  return t('expiresInHours', { hours });
}

export function MembersTab({ onGoToRoles }: MembersTabProps = {}) {
  const t = useTranslations('Settings.members');
  const tRoles = useTranslations('Settings.roles');
  const { user, canManageMembers } = useAuth();
  const { getPresence, getRow, now } = usePresence();

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [createMemberOpen, setCreateMemberOpen] = useState(false);
  const [removingMember, setRemovingMember] = useState<Member | null>(null);
  const [pendingMemberAction, setPendingMemberAction] = useState<string | null>(
    null,
  );

  const loadEverything = useCallback(async () => {
    try {
      const [mres, ires, rres] = await Promise.all([
        fetch('/api/account/members', { cache: 'no-store' }),
        canManageMembers
          ? fetch('/api/account/invitations', { cache: 'no-store' })
          : Promise.resolve(null),
        fetch('/api/account/roles', { cache: 'no-store' }),
      ]);

      if (!mres.ok) {
        const payload = await mres.json().catch(() => ({}));
        toast.error(payload.error || t('loadFailed'));
        return;
      }
      const mdata = (await mres.json()) as { members: Member[] };
      setMembers(mdata.members);

      if (rres && rres.ok) {
        const rdata = await rres.json();
        setCustomRoles(rdata.roles ?? []);
      }

      if (ires) {
        if (!ires.ok) {
          const payload = await ires.json().catch(() => ({}));
          toast.error(payload.error || t('loadInvitationsFailed'));
          return;
        }
        const idata = (await ires.json()) as { invitations: Invitation[] };
        setInvitations(idata.invitations);
      } else {
        setInvitations([]);
      }
    } catch (err) {
      console.error('[MembersTab] load error:', err);
      toast.error(t('networkError'));
    } finally {
      setLoading(false);
    }
  }, [canManageMembers, t]);

  useEffect(() => {
    void loadEverything();
  }, [loadEverything]);

  async function handleRoleChange(member: Member, roleValue: string) {
    const isCustom = roleValue.startsWith('custom:');
    const customRoleId = isCustom ? roleValue.replace('custom:', '') : null;
    const pickedCustom = isCustom ? customRoles.find((r) => r.id === customRoleId) : null;
    const nextRole: AccountRole = isCustom ? 'agent' : (roleValue as AccountRole);

    if (!isCustom && member.role === nextRole && !member.custom_role_id) return;
    if (isCustom && member.custom_role_id === customRoleId) return;

    const previousRole = member.role;
    const previousCustomId = member.custom_role_id;
    const previousCustomName = member.custom_role_name;

    setPendingMemberAction(member.user_id);
    setMembers((prev) =>
      prev.map((m) =>
        m.user_id === member.user_id
          ? {
              ...m,
              role: nextRole,
              custom_role_id: customRoleId,
              custom_role_name: pickedCustom?.name || null,
            }
          : m
      )
    );

    try {
      const res = await fetch(`/api/account/members/${member.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: nextRole,
          custom_role_id: customRoleId,
          custom_role_name: pickedCustom?.name || null,
        }),
      });
      if (!res.ok) {
        setMembers((prev) =>
          prev.map((m) =>
            m.user_id === member.user_id
              ? {
                  ...m,
                  role: previousRole,
                  custom_role_id: previousCustomId,
                  custom_role_name: previousCustomName,
                }
              : m
          )
        );
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || t('updateRoleFailed'));
        return;
      }
      toast.success(
        t('updatedToast', {
          name: member.full_name || t('unnamed'),
          role: pickedCustom?.name || tRoles(nextRole),
        })
      );
    } catch (err) {
      setMembers((prev) =>
        prev.map((m) =>
          m.user_id === member.user_id
            ? {
                ...m,
                role: previousRole,
                custom_role_id: previousCustomId,
                custom_role_name: previousCustomName,
              }
            : m
        )
      );
      console.error('[MembersTab] role change error:', err);
      toast.error(t('networkError'));
    } finally {
      setPendingMemberAction(null);
    }
  }

  async function handleRemove() {
    if (!removingMember) return;
    setPendingMemberAction(removingMember.user_id);
    try {
      const res = await fetch(
        `/api/account/members/${removingMember.user_id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || t('removeFailed'));
        return;
      }
      toast.success(t('removedToast', { name: removingMember.full_name || t('unnamed') }));
      setMembers((prev) =>
        prev.filter((m) => m.user_id !== removingMember.user_id),
      );
      setRemovingMember(null);
    } catch (err) {
      console.error('[MembersTab] remove error:', err);
      toast.error(t('networkError'));
    } finally {
      setPendingMemberAction(null);
    }
  }

  async function handleRevoke(invite: Invitation) {
    try {
      const res = await fetch(`/api/account/invitations/${invite.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || t('revokeFailed'));
        return;
      }
      toast.success(t('revokedToast'));
      setInvitations((prev) => prev.filter((i) => i.id !== invite.id));
    } catch (err) {
      console.error('[MembersTab] revoke error:', err);
      toast.error(t('networkError'));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
        action={
          <RequireRole min="admin">
            <div className="flex items-center gap-2">
              {onGoToRoles && (
                <Button variant="outline" onClick={onGoToRoles} className="gap-1.5 border-border">
                  <ShieldCheck className="size-4 text-primary" />
                  Role Manager
                </Button>
              )}
              <Button variant="outline" onClick={() => setInviteOpen(true)} className="gap-1.5 border-border">
                <Mail className="size-4" />
                Invite Link
              </Button>
              <Button onClick={() => setCreateMemberOpen(true)} className="gap-1.5">
                <UserPlus className="size-4" />
                Create Member
              </Button>
            </div>
          </RequireRole>
        }
      />

      {/* Live presence summary across the roster. Updates without a
          full refresh as heartbeats and the local re-derive tick land. */}
      {members.length > 0 &&
        (() => {
          const counts = summarize(members.map((m) => getPresence(m.user_id)));
          return (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <PresenceDot status="online" />
                {counts.online} {t('online')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <PresenceDot status="away" />
                {counts.away} {t('away')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <PresenceDot status="offline" />
                {counts.offline} {t('offline')}
              </span>
              <span className="text-muted-foreground/70">
                · {t('memberCount', { count: members.length })}
              </span>
            </div>
          );
        })()}

      {/* Roster */}
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {members.map((member) => {
              const roleMeta = ROLE_META[member.role];
              const RoleIcon = roleMeta.icon;
              const isSelf = member.user_id === user?.id;
              const isOwnerRow = member.role === 'owner';
              const isBusy = pendingMemberAction === member.user_id;
              const presence = getPresence(member.user_id);
              const presenceRow = getRow(member.user_id);
              const presenceText = presenceLabel(
                presence,
                presenceRow?.last_seen_at ?? null,
                now,
              );

              return (
                <li
                  key={member.user_id}
                  // Mobile: stack identity (avatar+name+email) above the
                  // role/remove actions so the role dropdown's fixed
                  // 128px width doesn't force the name into a 50-pixel
                  // truncation. Desktop (sm+): everything inline as
                  // before.
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Avatar className="size-9 shrink-0">
                            {member.avatar_url ? (
                              <AvatarImage
                                src={member.avatar_url}
                                alt={member.full_name || t('memberAlt')}
                              />
                            ) : null}
                            <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                              {(member.full_name || member.email || 'U')
                                .charAt(0)
                                .toUpperCase()}
                            </AvatarFallback>
                            {/* role+label so screen readers announce
                                presence — the hover tooltip alone isn't
                                reachable by keyboard/AT on a non-focusable
                                avatar. */}
                            <AvatarBadge
                              role="img"
                              aria-label={presenceText}
                              className={PRESENCE_DOT_CLASS[presence]}
                            />
                          </Avatar>
                        }
                      />
                      <TooltipContent>{presenceText}</TooltipContent>
                    </Tooltip>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {member.full_name || t('unnamed')}
                        </span>
                        {isSelf && (
                          <Badge className="bg-muted text-muted-foreground border-border text-[10px] uppercase tracking-wide">
                            {t('you')}
                          </Badge>
                        )}
                      </div>
                      {member.email && (
                        <p className="truncate text-xs text-muted-foreground">
                          {member.email}
                        </p>
                      )}
                      {(member.pipeline_name || member.stage_name || member.label) && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {member.pipeline_name && (
                            <span className="inline-flex items-center gap-1 rounded bg-muted/80 px-1.5 py-0.5 text-[10px] text-muted-foreground border border-border/60">
                              <Kanban className="size-2.5 text-primary" />
                              {member.pipeline_name}
                              {member.stage_name && (
                                <span className="text-foreground font-medium">› {member.stage_name}</span>
                              )}
                            </span>
                          )}
                          {member.label && (
                            <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary border border-primary/20 font-medium">
                              <Tag className="size-2.5" />
                              {member.label}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Joined date stays desktop-only. The mobile row's
                      vertical density makes the joined date noise. */}
                  <div className="hidden sm:block text-right text-xs text-muted-foreground">
                    {t('joined', { date: fmtDate(member.joined_at) })}
                  </div>

                  {/* Actions cluster. On mobile this is its own row
                      below the identity block; on desktop it sits
                      inline. Items align to the start on mobile so the
                      role dropdown lines up under the avatar. */}
                  <div className="flex items-center gap-2 sm:gap-3">
                    {/* Role display / editor. Inline Select is admin+
                        only AND not allowed on the owner row (owner
                        changes go through transfer, which lands later). */}
                    {canManageMembers && !isOwnerRow && !isSelf ? (
                      <Select
                        value={member.custom_role_id ? `custom:${member.custom_role_id}` : member.role}
                        onValueChange={(v) => v && handleRoleChange(member, v)}
                      >
                        <SelectTrigger
                          className="w-40 bg-muted border-border text-foreground"
                          disabled={isBusy}
                        >
                          <SelectValue>
                            {member.custom_role_name || tRoles(member.role)}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            System Roles
                          </div>
                          {EDITABLE_ROLES.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {tRoles(r.value)}
                            </SelectItem>
                          ))}
                          {customRoles.length > 0 && (
                            <>
                              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-t border-border mt-1 pt-1.5">
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
                    ) : (
                      member.custom_role_name ? (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                        >
                          <ShieldCheck className="size-3.5" />
                          {member.custom_role_name}
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${roleMeta.className}`}
                        >
                          <RoleIcon className="size-3.5" />
                          {tRoles(member.role)}
                        </span>
                      )
                    )}

                    {/* Remove. Admin+ only; never on the owner row;
                        never on yourself. Pre-polish styling was
                        neutral-default + red-on-hover — the
                        destructive intent was invisible until the
                        user moused over. Now red is the default
                        state with a darker shade on hover so the
                        affordance reads at-a-glance. */}
                    {canManageMembers && !isOwnerRow && !isSelf && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRemovingMember(member)}
                        disabled={isBusy}
                        className="border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:border-red-500/60 hover:text-red-200"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Pending invitations — admin+ only */}
      <RequireRole min="admin">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <UsersRound className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">
              {t('pendingInvitations')}
            </h3>
            <Badge className="bg-muted text-muted-foreground border-border">
              {invitations.length}
            </Badge>
          </div>
          {/* P10 — make the no-resend design explicit. Admins were
              confused why the pending list shows roles + expiry but
              no "copy link again" button. Stating the constraint up
              front (rather than letting the user discover it by
              looking for a button) keeps it from feeling like a bug. */}
          {invitations.length > 0 ? (
            <p className="mb-3 text-xs text-muted-foreground">
              {t('inviteHint')}
            </p>
          ) : null}

          {invitations.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                <Mail className="size-6 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('noPendingTitle')}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.rich('noPendingDesc', { bold: (chunks) => <strong>{chunks}</strong> })}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {invitations.map((inv) => {
                    const inviteRoleMeta = ROLE_META[inv.role];
                    const InviteRoleIcon = inviteRoleMeta.icon;
                    return (
                    <li
                      key={inv.id}
                      className="flex items-center gap-4 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {inv.label || t('untitledInvite')}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${inviteRoleMeta.className}`}
                          >
                            <InviteRoleIcon className="size-3" />
                            {tRoles(inv.role)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t('created', { date: fmtDate(inv.created_at) })} · {fmtExpiresIn(inv.expires_at, t)}
                        </p>
                      </div>

                      {/* Revoke: red default state, mirrors the
                          members-tab Remove button. Pre-polish version
                          read as a neutral secondary button until
                          hover. */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRevoke(inv)}
                        className="border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:border-red-500/60 hover:text-red-200"
                      >
                        <MailX className="size-4" />
                        {t('revoke')}
                      </Button>
                    </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </RequireRole>

      <CreateMemberDialog
        open={createMemberOpen}
        onOpenChange={setCreateMemberOpen}
        onCreated={loadEverything}
        customRoles={customRoles}
      />

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onCreated={loadEverything}
        customRoles={customRoles}
      />

      <Dialog
        open={removingMember !== null}
        onOpenChange={(open) => {
          if (!open) setRemovingMember(null);
        }}
      >
        <DialogContent className="bg-popover border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-popover-foreground">
              <AlertTriangle className="size-4 text-amber-400" />
              {t('removeDialogTitle')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t.rich('removeDialogDesc', { 
                name: removingMember?.full_name || t('unnamed'),
                bold: (chunks: React.ReactNode) => <strong>{chunks}</strong>
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setRemovingMember(null)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleRemove}
              disabled={!!pendingMemberAction}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {pendingMemberAction ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('removing')}
                </>
              ) : (
                t('removeBtn')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
