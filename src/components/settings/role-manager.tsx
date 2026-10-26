"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  ShieldCheck,
  Plus,
  Users,
  Check,
  Edit2,
  Trash2,
  Crown,
  Shield,
  UserCog,
  User,
  Filter,
  Tag as TagIcon,
  MessageSquare,
  Sparkles,
  Lock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { CustomRole, RolePermissions, Tag } from "@/types";
import { cn } from "@/lib/utils";
import { SettingsPanelHead } from "./settings-panel-head";

const COLOR_OPTIONS = [
  "#8b5cf6", // Violet
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#f43f5e", // Rose
  "#06b6d4", // Cyan
  "#ec4899", // Pink
];

interface RoleManagerProps {
  onGoToMembers?: () => void;
}

export function RoleManager({ onGoToMembers }: RoleManagerProps) {
  const { canManageMembers, accountId } = useAuth();
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#8b5cf6");
  const [permissions, setPermissions] = useState<RolePermissions>({
    view_all_conversations: false,
    only_assigned_conversations: true,
    assigned_tag_ids: [],
    can_view_contacts: true,
    can_edit_contacts: true,
    can_send_messages: true,
    can_access_pipelines: true,
    can_access_broadcasts: false,
    can_access_automations: false,
    can_access_flows: false,
    can_access_ai_agents: false,
    can_access_settings: false,
  });
  const [saving, setSaving] = useState(false);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/account/roles", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setCustomRoles(data.roles ?? []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTags = useCallback(async () => {
    if (!accountId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("tags")
      .select("*")
      .order("name", { ascending: true });
    if (data) setAvailableTags(data);
  }, [accountId]);

  useEffect(() => {
    fetchRoles();
    fetchTags();
  }, [fetchRoles, fetchTags]);

  const handleOpenCreate = () => {
    setEditingRole(null);
    setName("");
    setDescription("");
    setColor("#8b5cf6");
    setPermissions({
      view_all_conversations: false,
      only_assigned_conversations: true,
      assigned_tag_ids: [],
      can_view_contacts: true,
      can_edit_contacts: true,
      can_send_messages: true,
      can_access_pipelines: true,
      can_access_broadcasts: false,
      can_access_automations: false,
      can_access_flows: false,
      can_access_ai_agents: false,
      can_access_settings: false,
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (role: CustomRole) => {
    setEditingRole(role);
    setName(role.name);
    setDescription(role.description || "");
    setColor(role.color || "#8b5cf6");
    setPermissions(role.permissions || {});
    setDialogOpen(true);
  };

  const handleToggleTag = (tagId: string) => {
    const current = permissions.assigned_tag_ids || [];
    const next = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    setPermissions((prev) => ({ ...prev, assigned_tag_ids: next }));
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter a role name");
      return;
    }

    setSaving(true);
    try {
      const url = editingRole
        ? `/api/account/roles/${editingRole.id}`
        : "/api/account/roles";
      const method = editingRole ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          color,
          permissions,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save role");
      }

      toast.success(
        editingRole ? "Role updated successfully!" : "Custom role created!"
      );
      setDialogOpen(false);
      fetchRoles();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save role");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async (roleId: string, roleName: string) => {
    if (!confirm(`Are you sure you want to delete the role "${roleName}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/account/roles/${roleId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete role");
      toast.success("Role deleted");
      fetchRoles();
    } catch {
      toast.error("Could not delete role");
    }
  };

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in-50 duration-200">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SettingsPanelHead
          title="Role Manager & Permissions"
          description="Create custom roles with fine-grained access control: restrict inbox visibility to assigned leads or specific tags, and configure module permissions."
        />
        {canManageMembers && (
          <Button
            onClick={handleOpenCreate}
            className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
          >
            <Plus className="h-4 w-4" />
            Create Role
          </Button>
        )}
      </div>

      {/* System Roles Reference */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            Built-in System Roles
          </CardTitle>
          <CardDescription>
            Core system roles provided by the platform with predefined privilege ranks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="flex items-center gap-2 font-semibold text-xs text-amber-500 mb-1">
                <Crown className="h-3.5 w-3.5" />
                Owner
              </div>
              <p className="text-[11px] text-muted-foreground">
                Account creator. Full ownership, billing, delete account & transfer.
              </p>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center gap-2 font-semibold text-xs text-primary mb-1">
                <Shield className="h-3.5 w-3.5" />
                Admin
              </div>
              <p className="text-[11px] text-muted-foreground">
                Manage members, roles, WhatsApp configuration & workspace settings.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center gap-2 font-semibold text-xs text-foreground mb-1">
                <UserCog className="h-3.5 w-3.5" />
                Agent
              </div>
              <p className="text-[11px] text-muted-foreground">
                Full operational access: message threads, contacts, pipelines & broadcast.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center gap-2 font-semibold text-xs text-muted-foreground mb-1">
                <User className="h-3.5 w-3.5" />
                Viewer
              </div>
              <p className="text-[11px] text-muted-foreground">
                Read-only visibility across conversations, contacts and analytics.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Custom Roles List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Custom Roles ({customRoles.length})
          </h3>
          {onGoToMembers && (
            <Button
              variant="link"
              size="sm"
              onClick={onGoToMembers}
              className="text-xs text-primary p-0 h-auto"
            >
              Assign roles in Team Members →
            </Button>
          )}
        </div>

        {loading ? (
          <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
            Loading roles...
          </div>
        ) : customRoles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-3">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No custom roles created yet</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Create customized roles like &quot;Sales Team 2&quot; with restricted visibility to
                only their assigned leads or specific tags.
              </p>
            </div>
            {canManageMembers && (
              <Button size="sm" onClick={handleOpenCreate} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Create Role Now
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {customRoles.map((role) => {
              const perms = role.permissions || {};
              const tagIds = perms.assigned_tag_ids || [];
              const matchedTags = availableTags.filter((t) => tagIds.includes(t.id));

              return (
                <div
                  key={role.id}
                  className="rounded-xl border border-border bg-card p-4 space-y-3 transition-shadow hover:shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-3.5 w-3.5 rounded-full shrink-0 shadow-xs"
                        style={{ backgroundColor: role.color || "#8b5cf6" }}
                      />
                      <div>
                        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                          {role.name}
                        </h4>
                        {role.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {role.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {canManageMembers && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => handleOpenEdit(role)}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteRole(role.id, role.name)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Permissions Summary Badges */}
                  <div className="pt-2 border-t border-border/60 space-y-2">
                    <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                      <Filter className="h-3 w-3" />
                      Inbox Lead Visibility:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {perms.view_all_conversations ? (
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          All conversations visible
                        </Badge>
                      ) : (
                        <>
                          {perms.only_assigned_conversations && (
                            <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                              Only assigned leads
                            </Badge>
                          )}
                          {tagIds.length > 0 ? (
                            matchedTags.map((tag) => (
                              <span
                                key={tag.id}
                                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                                style={{
                                  backgroundColor: `${tag.color}20`,
                                  color: tag.color,
                                }}
                              >
                                Tag: {tag.name}
                              </span>
                            ))
                          ) : (
                            !perms.only_assigned_conversations && (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                Restricted visibility
                              </Badge>
                            )
                          )}
                        </>
                      )}
                    </div>

                    <div className="pt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                      {perms.can_send_messages && <span className="bg-muted px-1.5 py-0.5 rounded">Messages</span>}
                      {perms.can_edit_contacts && <span className="bg-muted px-1.5 py-0.5 rounded">Edit Contacts</span>}
                      {perms.can_access_pipelines && <span className="bg-muted px-1.5 py-0.5 rounded">Pipelines</span>}
                      {perms.can_access_broadcasts && <span className="bg-muted px-1.5 py-0.5 rounded">Broadcasts</span>}
                      {perms.can_access_automations && <span className="bg-muted px-1.5 py-0.5 rounded">Automations</span>}
                      {perms.can_access_ai_agents && <span className="bg-muted px-1.5 py-0.5 rounded">AI Agents</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Role Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? "Edit Role" : "Create Custom Role"}</DialogTitle>
            <DialogDescription>
              Define what members with this role can see in their inbox and what features they can manage.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveRole} className="space-y-5 py-2">
            {/* Name & Color */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="roleName">Role Name *</Label>
                <Input
                  id="roleName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sales Team 2 or Sample Dispatcher"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Role Badge Color</Label>
                <div className="flex items-center gap-1.5">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={cn(
                        "h-6 w-6 rounded-full transition-transform",
                        color === c && "ring-2 ring-primary ring-offset-2 scale-110"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="roleDesc">Description</Label>
              <Textarea
                id="roleDesc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Assigned to share related samples to clients added to Tag 1"
                rows={2}
                className="text-xs resize-none"
              />
            </div>

            {/* Section 1: Lead & Conversation Visibility (Core User Request) */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
                <Filter className="h-3.5 w-3.5" />
                Inbox & Lead Access Control
              </div>

              <div className="space-y-3">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!permissions.view_all_conversations}
                    onChange={(e) =>
                      setPermissions((prev) => ({
                        ...prev,
                        view_all_conversations: e.target.checked,
                      }))
                    }
                    className="mt-0.5 rounded border-border"
                  />
                  <div>
                    <div className="text-xs font-semibold text-foreground">
                      View all conversations across the workspace
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      When unchecked, the role will only see leads specifically assigned to them or their allowed tags.
                    </div>
                  </div>
                </label>

                {!permissions.view_all_conversations && (
                  <div className="pl-6 pt-2 border-t border-primary/20 space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                      <input
                        type="checkbox"
                        checked={!!permissions.only_assigned_conversations}
                        onChange={(e) =>
                          setPermissions((prev) => ({
                            ...prev,
                            only_assigned_conversations: e.target.checked,
                          }))
                        }
                        className="rounded border-border"
                      />
                      Show leads assigned to this member
                    </label>

                    {/* Assigned Tags Restriction */}
                    <div className="space-y-2">
                      <Label className="text-xs text-foreground flex items-center gap-1.5">
                        <TagIcon className="h-3 w-3 text-primary" />
                        Allow access to conversations with specific tags:
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        Members with this role will see conversations that carry any of these selected tags (e.g. &quot;Details received&quot;).
                      </p>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {availableTags.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            No tags created yet. Add tags in Settings &gt; Fields &amp; tags.
                          </span>
                        ) : (
                          availableTags.map((tag) => {
                            const isSelected = permissions.assigned_tag_ids?.includes(tag.id);
                            return (
                              <button
                                key={tag.id}
                                type="button"
                                onClick={() => handleToggleTag(tag.id)}
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors border",
                                  isSelected
                                    ? "ring-1 ring-primary shadow-xs"
                                    : "border-border bg-muted/40 hover:bg-muted text-muted-foreground"
                                )}
                                style={{
                                  backgroundColor: isSelected ? `${tag.color}25` : undefined,
                                  borderColor: isSelected ? tag.color : undefined,
                                  color: isSelected ? tag.color : undefined,
                                }}
                              >
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: tag.color }}
                                />
                                {tag.name}
                                {isSelected && <Check className="h-3 w-3 ml-0.5" />}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 2: Operational Permissions */}
            <div className="rounded-xl border border-border p-4 space-y-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Module &amp; Action Permissions
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!permissions.can_send_messages}
                    onChange={(e) =>
                      setPermissions((prev) => ({
                        ...prev,
                        can_send_messages: e.target.checked,
                      }))
                    }
                    className="rounded border-border"
                  />
                  <span>Send messages &amp; replies</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!permissions.can_edit_contacts}
                    onChange={(e) =>
                      setPermissions((prev) => ({
                        ...prev,
                        can_edit_contacts: e.target.checked,
                      }))
                    }
                    className="rounded border-border"
                  />
                  <span>Edit contacts &amp; manage tags</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!permissions.can_access_pipelines}
                    onChange={(e) =>
                      setPermissions((prev) => ({
                        ...prev,
                        can_access_pipelines: e.target.checked,
                      }))
                    }
                    className="rounded border-border"
                  />
                  <span>Access Pipelines &amp; Deals</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!permissions.can_access_broadcasts}
                    onChange={(e) =>
                      setPermissions((prev) => ({
                        ...prev,
                        can_access_broadcasts: e.target.checked,
                      }))
                    }
                    className="rounded border-border"
                  />
                  <span>Send Broadcast campaigns</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!permissions.can_access_automations}
                    onChange={(e) =>
                      setPermissions((prev) => ({
                        ...prev,
                        can_access_automations: e.target.checked,
                      }))
                    }
                    className="rounded border-border"
                  />
                  <span>Manage Automations &amp; Flows</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!permissions.can_access_ai_agents}
                    onChange={(e) =>
                      setPermissions((prev) => ({
                        ...prev,
                        can_access_ai_agents: e.target.checked,
                      }))
                    }
                    className="rounded border-border"
                  />
                  <span>Access AI Agents</span>
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90">
                {saving ? "Saving..." : editingRole ? "Save Changes" : "Create Role"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
