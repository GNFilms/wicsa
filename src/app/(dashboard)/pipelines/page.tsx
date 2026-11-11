"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Pipeline, PipelineStage, Deal } from "@/types";
import { PipelineBoard } from "@/components/pipelines/pipeline-board";
import { PipelineSettings } from "@/components/pipelines/pipeline-settings";
import { DealForm } from "@/components/pipelines/deal-form";
import { PipelineAnalytics } from "@/components/pipelines/pipeline-analytics";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GitBranch, Plus, ChevronDown, Settings, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { useCan } from "@/hooks/use-can";
import { useAuth } from "@/hooks/use-auth";
import { GatedButton } from "@/components/ui/gated-button";
import { useTranslations } from "next-intl";
import { getMemberColor } from "@/components/pipelines/member-colors";

// Pipeline creation is admin-class (settings-tier write under
// the new RLS); deal creation is operational and only requires
// agent+. The two CTAs gate on different `useCan` capabilities,
// not on different copy.

// Spec-defined seed — name and color per the product spec.
const SPEC_DEFAULT_STAGES = [
  { name: "New Lead", color: "#3b82f6", position: 0 }, // blue
  { name: "Qualified", color: "#eab308", position: 1 }, // yellow
  { name: "Proposal Sent", color: "#f97316", position: 2 }, // orange
  { name: "Negotiation", color: "#8b5cf6", position: 3 }, // purple
  { name: "Won", color: "#22c55e", position: 4 }, // green
];

export default function PipelinesPage() {
  const t = useTranslations("Pipelines.page");
  const supabase = createClient();
  const canEditSettings = useCan("edit-settings");
  const canCreateDeals = useCan("send-messages");
  const { accountId, profile, isOwner, isAdmin } = useAuth();

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [teamMembers, setTeamMembers] = useState<{ id: string; user_id: string; full_name: string }[]>([]);
  const [selectedStageAssignee, setSelectedStageAssignee] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  // Dialog / sheet state
  const [newPipelineOpen, setNewPipelineOpen] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Deal form state is lifted here so both the top-bar "Add Deal" and
  // the per-column "+" trigger the same Sheet.
  const [dealFormOpen, setDealFormOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [defaultStageId, setDefaultStageId] = useState<string>("");

  // Guard against double-seeding (React StrictMode double-effect in dev).
  const seedAttempted = useRef(false);

  const loadPipelines = useCallback(async (): Promise<Pipeline[]> => {
    const { data, error } = await supabase
      .from("pipelines")
      .select("*")
      .order("created_at");
    if (error) {
      console.error("Failed to load pipelines:", error.message);
      return [];
    }
    const all = (data ?? []) as Pipeline[];

    // Filter assigned pipelines for non-admin team members if assigned to a specific pipeline
    const assignedPipelineId = (profile as { pipeline_id?: string | null })?.pipeline_id;
    if (!isOwner && !isAdmin && assignedPipelineId) {
      const filtered = all.filter((p: Pipeline) => p.id === assignedPipelineId);
      return filtered.length > 0 ? filtered : all;
    }
    return all;
  }, [supabase, isOwner, isAdmin, (profile as { pipeline_id?: string | null })?.pipeline_id]);

  const loadStages = useCallback(
    async (pipelineId: string) => {
      const { data } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("position");
      return data ?? [];
    },
    [supabase],
  );

  const loadDeals = useCallback(
    async (pipelineId: string) => {
      const { data } = await supabase
        .from("deals")
        .select("*, contact:contacts(*), assignee:profiles!deals_assigned_to_fkey(*)")
        .eq("pipeline_id", pipelineId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Deal[];
    },
    [supabase],
  );

  const seedDefaultPipeline = useCallback(async (): Promise<Pipeline | null> => {
    const {
      data: { session },
    } = await (supabase.auth as any).getSession();
    const user = session?.user;
    if (!user) return null;
    // pipelines.account_id is NOT NULL post-017 with no DB default.
    if (!accountId) return null;

    const { data: pipeline, error } = await supabase
      .from("pipelines")
      .insert({ user_id: user.id, account_id: accountId, name: "Sales Pipeline" })
      .select()
      .single();

    if (error || !pipeline) {
      console.error("Failed to seed pipeline:", error?.message);
      return null;
    }

    const stagesPayload = SPEC_DEFAULT_STAGES.map((s) => ({
      pipeline_id: pipeline.id,
      name: s.name,
      color: s.color,
      position: s.position,
    }));
    await supabase.from("pipeline_stages").insert(stagesPayload);

    return pipeline as Pipeline;
  }, [supabase, accountId]);

  // Initial load + seed-if-empty
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let list = await loadPipelines();

      if (list.length === 0 && !seedAttempted.current) {
        seedAttempted.current = true;
        const seeded = await seedDefaultPipeline();
        if (seeded) list = await loadPipelines();
      }

      if (cancelled) return;
      setPipelines(list);
      if (list.length > 0) {
        setSelectedPipelineId((prev) =>
          prev && list.some((p: Pipeline) => p.id === prev) ? prev : list[0].id,
        );
      } else {
        setSelectedPipelineId("");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPipelines, seedDefaultPipeline]);

  // Load stages + deals whenever selected pipeline changes.
  // Clearing on no-selection is a legitimate sync with URL/prop
  // state; the load completion uses async setters inside promise
  // callbacks (not synchronous in the effect body).
  useEffect(() => {
    if (!selectedPipelineId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStages([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDeals([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const [s, d] = await Promise.all([
        loadStages(selectedPipelineId),
        loadDeals(selectedPipelineId),
      ]);
      if (cancelled) return;
      setStages(s);
      setDeals(d);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPipelineId, loadStages, loadDeals]);

  // Load team members for stage assignee filter (admin/owner)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let query = supabase
        .from("profiles")
        .select("id, user_id, full_name")
        .order("full_name");
      if (accountId) {
        query = query.eq("account_id", accountId);
      }
      const { data } = await query;
      if (!cancelled && data) {
        setTeamMembers(data as { id: string; user_id: string; full_name: string }[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, accountId]);

  const refreshPipelines = useCallback(async () => {
    const list = await loadPipelines();
    setPipelines(list);
    if (list.length === 0) setSelectedPipelineId("");
    else if (!list.some((p: Pipeline) => p.id === selectedPipelineId))
      setSelectedPipelineId(list[0].id);
  }, [loadPipelines, selectedPipelineId]);

  const refreshStages = useCallback(async () => {
    if (!selectedPipelineId) return;
    setStages(await loadStages(selectedPipelineId));
  }, [loadStages, selectedPipelineId]);

  const refreshDeals = useCallback(async () => {
    if (!selectedPipelineId) return;
    setDeals(await loadDeals(selectedPipelineId));
  }, [loadDeals, selectedPipelineId]);

  const handleDealMoved = useCallback(
    async (dealId: string, newStageId: string) => {
      // Optimistic update — board already animated; just persist.
      setDeals((prev) =>
        prev.map((d) => (d.id === dealId ? { ...d, stage_id: newStageId } : d)),
      );

      const targetStage = stages.find((s) => s.id === newStageId);
      const updatePayload: Record<string, unknown> = { stage_id: newStageId };
      if (targetStage?.default_assignee_id) {
        updatePayload.assigned_to = targetStage.default_assignee_id;
      }

      const { error } = await supabase
        .from("deals")
        .update(updatePayload)
        .eq("id", dealId);

      if (error) {
        toast.error(t("toastFailedMoveDeal"));
        refreshDeals();
        return;
      }

      // Record stage change activity
      const movedDeal = deals.find((d) => d.id === dealId);
      const fromStage = stages.find((s) => s.id === movedDeal?.stage_id)?.name;
      const toStage = targetStage?.name;
      fetch("/api/deals/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_id: dealId,
          user_id: profile?.user_id,
          account_id: accountId,
          activity_type: "stage_change",
          actor_name: profile?.full_name || "Team Member",
          details: { from_stage: fromStage, to_stage: toStage },
        }),
      }).catch(console.error);

      // Auto-assign conversation when deal lands on a stage with a default assignee
      if (targetStage?.default_assignee_id) {
        const movedDeal = deals.find((d) => d.id === dealId);
        if (movedDeal?.contact_id) {
          const { data: assigneeProfile } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("id", targetStage.default_assignee_id)
            .maybeSingle();

          if (assigneeProfile?.user_id) {
            await supabase
              .from("conversations")
              .update({ assigned_agent_id: assigneeProfile.user_id })
              .eq("contact_id", movedDeal.contact_id);
          }
        }
      }
    },
    [supabase, refreshDeals, t, stages, deals],
  );

  const handleAddDeal = useCallback(
    (stageId?: string) => {
      setEditingDeal(null);
      setDefaultStageId(stageId ?? stages[0]?.id ?? "");
      setDealFormOpen(true);
    },
    [stages],
  );

  const handleEditDeal = useCallback((deal: Deal) => {
    setEditingDeal(deal);
    setDefaultStageId(deal.stage_id);
    setDealFormOpen(true);
  }, []);

  async function handleCreatePipeline() {
    const name = newPipelineName.trim();
    if (!name) return;
    setCreating(true);

    const {
      data: { session },
    } = await (supabase.auth as any).getSession();
    const user = session?.user;
    if (!user) {
      setCreating(false);
      return;
    }
    // pipelines.account_id is NOT NULL post-017 with no DB default.
    if (!accountId) {
      toast.error(t("toastNotLinkedToAccount"));
      setCreating(false);
      return;
    }

    const { data: pipeline, error } = await supabase
      .from("pipelines")
      .insert({ user_id: user.id, account_id: accountId, name })
      .select()
      .single();

    if (error || !pipeline) {
      toast.error(t("toastFailedCreatePipeline"));
      setCreating(false);
      return;
    }

    const stagesPayload = SPEC_DEFAULT_STAGES.map((s) => ({
      pipeline_id: pipeline.id,
      name: s.name,
      color: s.color,
      position: s.position,
    }));
    await supabase.from("pipeline_stages").insert(stagesPayload);

    setNewPipelineName("");
    setNewPipelineOpen(false);
    setSelectedPipelineId(pipeline.id);
    await refreshPipelines();
    setCreating(false);
    toast.success(t("toastPipelineCreated"));
  }

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId);

  const visibleStages = useMemo(() => {
    if (!isOwner && !isAdmin) {
      // If team member is restricted to a specific stage via profile.stage_id, show that stage, otherwise show all
      const assignedStageId = (profile as { stage_id?: string | null })?.stage_id;
      if (assignedStageId) {
        const assigned = stages.filter((s) => s.id === assignedStageId);
        if (assigned.length > 0) return assigned;
      }
      return stages;
    }
    // Admin / owner always sees all stages (columns) of the pipeline
    return stages;
  }, [stages, isOwner, isAdmin, profile]);

  const visibleDeals = useMemo(() => {
    const stageIdSet = new Set(visibleStages.map((s: PipelineStage) => s.id));
    const pipelineDeals = deals.filter((d) => stageIdSet.has(d.stage_id));

    if (!isOwner && !isAdmin) {
      // Team members strictly see ONLY the leads/deals assigned to them
      const myId = profile?.id;
      const myUserId = profile?.user_id;
      const myName = profile?.full_name?.trim().toLowerCase();
      return pipelineDeals.filter(
        (d) =>
          d.assigned_to === myId ||
          d.assigned_to === myUserId ||
          d.assignee?.id === myId ||
          d.assignee?.user_id === myUserId ||
          (myName && d.assignee?.full_name && d.assignee.full_name.trim().toLowerCase() === myName)
      );
    }

    if (selectedStageAssignee === "unassigned") {
      return pipelineDeals.filter((d) => !d.assigned_to && !d.assignee);
    }

    if (selectedStageAssignee !== "all") {
      const targetMember = teamMembers.find(
        (m) => m.id === selectedStageAssignee || m.user_id === selectedStageAssignee,
      );
      const targetId = targetMember?.id || selectedStageAssignee;
      const targetUserId = targetMember?.user_id;
      const targetName = targetMember?.full_name?.trim().toLowerCase();

      return pipelineDeals.filter((d) => {
        // Match by profile ID or user ID in deal.assigned_to
        if (d.assigned_to && (d.assigned_to === targetId || d.assigned_to === targetUserId)) {
          return true;
        }
        // Match by joined assignee profile
        if (d.assignee) {
          if (d.assignee.id === targetId || d.assignee.id === targetUserId) return true;
          if (d.assignee.user_id && (d.assignee.user_id === targetId || d.assignee.user_id === targetUserId)) return true;
          if (targetName && d.assignee.full_name && d.assignee.full_name.trim().toLowerCase() === targetName) return true;
        }
        // Also match if the stage has this member as default assignee
        const stageObj = stages.find((s) => s.id === d.stage_id);
        if (
          stageObj?.default_assignee_id &&
          (stageObj.default_assignee_id === targetId || stageObj.default_assignee_id === targetUserId)
        ) {
          return true;
        }
        return false;
      });
    }

    return pipelineDeals;
  }, [deals, visibleStages, isOwner, isAdmin, profile, selectedStageAssignee, teamMembers, stages]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-9 w-28 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="flex gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-96 w-72 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Pipeline selector dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors data-[popup-open]:bg-muted"
            >
              <GitBranch className="h-4 w-4 text-primary" />
              <span className="font-semibold">
                {selectedPipeline?.name ?? t("selectPipeline")}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-64 border-border bg-popover text-popover-foreground"
            >
              {pipelines.length === 0 && (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  {t("noPipelinesYet")}
                </DropdownMenuItem>
              )}
              {pipelines.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => setSelectedPipelineId(p.id)}
                  className={
                    p.id === selectedPipelineId
                      ? "text-primary"
                      : "text-popover-foreground"
                  }
                >
                  <GitBranch className="mr-2 h-3.5 w-3.5" />
                  {p.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-border" />
              {selectedPipeline && (
                <DropdownMenuItem
                  onClick={() => setSettingsOpen(true)}
                  className="text-popover-foreground"
                >
                  <Settings className="mr-2 h-3.5 w-3.5" />
                  {t("managePipelines")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Stage Assignee Filter for Admin/Owner */}
          {(isOwner || isAdmin) ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors data-[popup-open]:bg-muted"
              >
                {(() => {
                  const selectedMember = teamMembers.find(
                    (m) => m.id === selectedStageAssignee || m.user_id === selectedStageAssignee,
                  );
                  const color = selectedMember
                    ? getMemberColor(selectedMember.full_name || selectedMember.id)
                    : null;
                  return (
                    <>
                      {color ? (
                        <span
                          className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-xs"
                          style={{ backgroundColor: color.hex }}
                        >
                          {selectedMember?.full_name?.charAt(0).toUpperCase() || "A"}
                        </span>
                      ) : (
                        <UserCheck className="h-4 w-4 text-primary" />
                      )}
                      <span className="font-semibold text-xs">
                        {selectedStageAssignee === "all"
                          ? "All Assignees"
                          : selectedStageAssignee === "unassigned"
                          ? "Unassigned Leads"
                          : selectedMember?.full_name ?? "Filter Assignee"}
                      </span>
                    </>
                  );
                })()}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-56 border-border bg-popover text-popover-foreground"
              >
                <DropdownMenuItem
                  onClick={() => setSelectedStageAssignee("all")}
                  className={selectedStageAssignee === "all" ? "text-primary font-medium" : "text-popover-foreground"}
                >
                  All Assignees
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSelectedStageAssignee("unassigned")}
                  className={selectedStageAssignee === "unassigned" ? "text-primary font-medium" : "text-popover-foreground"}
                >
                  Unassigned Leads
                </DropdownMenuItem>
                {teamMembers.length > 0 && <DropdownMenuSeparator className="bg-border" />}
                {teamMembers.map((m) => {
                  const color = getMemberColor(m.full_name || m.id);
                  const isSelected = selectedStageAssignee === m.id || selectedStageAssignee === m.user_id;
                  return (
                    <DropdownMenuItem
                      key={m.id}
                      onClick={() => setSelectedStageAssignee(m.id)}
                      className={`gap-2 cursor-pointer ${
                        isSelected ? "bg-muted font-medium" : "text-popover-foreground"
                      }`}
                    >
                      <span
                        className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-xs shrink-0"
                        style={{ backgroundColor: color.hex }}
                      >
                        {m.full_name?.charAt(0).toUpperCase() || "A"}
                      </span>
                      <span className="flex-1 truncate">{m.full_name || "Agent"}</span>
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: color.hex }}
                      />
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary font-medium">
              <UserCheck className="h-3.5 w-3.5" />
              <span>Assigned Leads ({visibleDeals.length})</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <GatedButton
            variant="outline"
            canAct={canEditSettings}
            gateReason="create pipelines"
            onClick={() => setNewPipelineOpen(true)}
            className="border-border bg-card text-foreground hover:bg-muted"
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("addPipeline")}
          </GatedButton>
          <GatedButton
            canAct={canCreateDeals}
            gateReason="create deals"
            disabled={!selectedPipelineId || visibleStages.length === 0}
            onClick={() => handleAddDeal()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("addDeal")}
          </GatedButton>
        </div>
      </div>

      {/* Board */}
      {pipelines.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
          <GitBranch className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium text-foreground">
            {t("noPipelinesYet")}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("createToStartTracking")}
          </p>
          <GatedButton
            canAct={canEditSettings}
            gateReason="create pipelines"
            onClick={() => setNewPipelineOpen(true)}
            className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("createPipeline")}
          </GatedButton>
        </div>
      ) : !isOwner && !isAdmin && visibleStages.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <GitBranch className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium text-foreground">
            No pipeline stages assigned
          </h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-sm">
            {t("noAssignedStages")}
          </p>
        </div>
      ) : (
        <>
          <PipelineAnalytics stages={visibleStages} deals={visibleDeals} />
          <PipelineBoard
            stages={visibleStages}
            deals={visibleDeals}
            onDealMoved={handleDealMoved}
            onAddDeal={handleAddDeal}
            onEditDeal={handleEditDeal}
          />
        </>
      )}

      {/* New Pipeline Dialog */}
      <Dialog open={newPipelineOpen} onOpenChange={setNewPipelineOpen}>
        <DialogContent className="sm:max-w-sm bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">{t("newPipeline")}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-muted-foreground">{t("pipelineName")}</Label>
            <Input
              value={newPipelineName}
              onChange={(e) => setNewPipelineName(e.target.value)}
              placeholder={t("pipelineNamePlaceholder")}
              className="mt-2 bg-muted border-border text-foreground"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreatePipeline();
              }}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {t("defaultStagesDesc")}
            </p>
          </div>
          <DialogFooter className="bg-popover/50 border-border">
            <Button
              variant="outline"
              onClick={() => setNewPipelineOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleCreatePipeline}
              disabled={creating || !newPipelineName.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {creating ? t("creating") : t("createPipelineBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pipeline Settings */}
      {selectedPipeline && (
        <PipelineSettings
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          pipeline={selectedPipeline}
          stages={stages}
          onPipelinesChanged={refreshPipelines}
          onStagesChanged={refreshStages}
          onCreateNewPipeline={() => {
            setSettingsOpen(false);
            setNewPipelineOpen(true);
          }}
        />
      )}

      {/* Deal Form (Sheet) */}
      <DealForm
        open={dealFormOpen}
        onOpenChange={setDealFormOpen}
        deal={editingDeal}
        pipelineId={selectedPipelineId}
        stages={stages}
        defaultStageId={defaultStageId}
        onSaved={refreshDeals}
      />
    </div>
  );
}
