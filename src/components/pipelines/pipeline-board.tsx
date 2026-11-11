"use client";

import { useMemo, useState, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Deal, PipelineStage } from "@/types";
import { DealCard } from "./deal-card";
import { Button } from "@/components/ui/button";
import { Plus, Settings, UserCheck, Copy, ArrowUpDown, Archive, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/currency";
import { useTranslations } from "next-intl";
import { getMemberColor } from "./member-colors";

interface PipelineBoardProps {
  stages: PipelineStage[];
  deals: Deal[];
  onDealMoved: (dealId: string, newStageId: string) => void;
  onAddDeal: (stageId: string) => void;
  onEditDeal: (deal: Deal) => void;
}

export function PipelineBoard({
  stages,
  deals,
  onDealMoved,
  onAddDeal,
  onEditDeal,
}: PipelineBoardProps) {
  const { defaultCurrency } = useAuth();
  const [activeDealId, setActiveDealId] = useState<string | null>(null);

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages],
  );

  const dealsByStage = useMemo(() => {
    const map = new Map<string, Deal[]>();
    for (const stage of sortedStages) map.set(stage.id, []);
    for (const deal of deals) {
      const bucket = map.get(deal.stage_id);
      if (bucket) bucket.push(deal);
    }
    return map;
  }, [sortedStages, deals]);

  const sensors = useSensors(
    // 5px activation distance avoids clicks being interpreted as drags.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Keyboard drag support: focus a card, Space to pick up, arrows to move,
    // Space to drop, Escape to cancel.
    useSensor(KeyboardSensor),
  );

  const activeDeal = activeDealId
    ? deals.find((d) => d.id === activeDealId) ?? null
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveDealId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDealId(null);
    const { active, over } = event;
    if (!over) return;
    const dealId = String(active.id);
    const targetStageId = String(over.id);

    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage_id === targetStageId) return;
    if (!sortedStages.some((s) => s.id === targetStageId)) return;

    onDealMoved(dealId, targetStageId);
  }

  function handleDragCancel() {
    setActiveDealId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/* snap-x + snap-mandatory on mobile so swipes land the next
          stage cleanly at the viewport edge instead of mid-column.
          Disabled on lg+ where snapping would interfere with the
          natural layout. The board can still overflow horizontally on
          lg+ once a pipeline has many stages (columns keep a 260px
          min-width), so a thin scrollbar stays visible on desktop. */}
      <div className="pipeline-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4 lg:snap-none">
        {sortedStages.map((stage) => {
          const stageDeals = dealsByStage.get(stage.id) ?? [];
          const totalValue = stageDeals.reduce(
            (s, d) => s + Number(d.value || 0),
            0,
          );
          return (
            <StageColumn
              key={stage.id}
              stage={stage}
              deals={stageDeals}
              totalValue={totalValue}
              currency={defaultCurrency}
              onAddDeal={onAddDeal}
              onEditDeal={onEditDeal}
            />
          );
        })}
      </div>

      <DragOverlay
        dropAnimation={{
          duration: 200,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
        }}
      >
        {activeDeal ? (
          <div className="opacity-90">
            <DealCard
              deal={activeDeal}
              stage={
                sortedStages.find((s) => s.id === activeDeal.stage_id) ?? null
              }
              onEdit={() => {}}
              isOverlay
            />
          </div>
        ) : null}
      </DragOverlay>

      <style jsx>{`
        .pipeline-scroll {
          scroll-behavior: smooth;
        }
        /* On touch devices the peek/snap layout already signals there's
           more to swipe, so the scrollbar is hidden for a clean look.
           On desktop (mouse) the board can overflow with many stages
           and there is no peek hint, so keep a thin, themed scrollbar
           visible to make the overflow discoverable and usable. */
        @media (hover: none), (pointer: coarse) {
          .pipeline-scroll::-webkit-scrollbar {
            height: 0;
            display: none;
          }
          .pipeline-scroll {
            scrollbar-width: none;
          }
        }
        @media (hover: hover) and (pointer: fine) {
          .pipeline-scroll {
            scrollbar-width: thin;
            scrollbar-color: var(--border) transparent;
          }
          .pipeline-scroll::-webkit-scrollbar {
            height: 8px;
          }
          .pipeline-scroll::-webkit-scrollbar-track {
            background: transparent;
          }
          .pipeline-scroll::-webkit-scrollbar-thumb {
            background-color: var(--border);
            border-radius: 9999px;
          }
          .pipeline-scroll::-webkit-scrollbar-thumb:hover {
            background-color: var(--muted-foreground);
          }
        }
      `}</style>
    </DndContext>
  );
}

function StageColumn({
  stage,
  deals,
  totalValue,
  currency,
  onAddDeal,
  onEditDeal,
}: {
  stage: PipelineStage;
  deals: Deal[];
  totalValue: number;
  currency: string;
  onAddDeal: (stageId: string) => void;
  onEditDeal: (deal: Deal) => void;
}) {
  const t = useTranslations("Pipelines.board");
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const [assigneeModalOpen, setAssigneeModalOpen] = useState(false);
  const [profiles, setProfiles] = useState<{ id: string; user_id: string; full_name: string }[]>([]);
  const [currentAssigneeId, setCurrentAssigneeId] = useState<string | null>(stage.default_assignee_id ?? null);
  const [savingAssignee, setSavingAssignee] = useState(false);

  const loadProfiles = async () => {
    const supabase = createClient();
    const { data } = await supabase.from("profiles").select("id, user_id, full_name").order("full_name");
    if (data) setProfiles(data);
  };

  useEffect(() => {
    void loadProfiles();
  }, []);

  const handleSaveAssignee = async (profileId: string | null) => {
    setSavingAssignee(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("pipeline_stages")
      .update({ default_assignee_id: profileId })
      .eq("id", stage.id);

    setSavingAssignee(false);
    if (error) {
      toast.error(`Failed to update assignee: ${error.message}`);
    } else {
      setCurrentAssigneeId(profileId);
      stage.default_assignee_id = profileId;
      toast.success("Default assignee updated for stage");
      setAssigneeModalOpen(false);
    }
  };

  return (
    // On mobile each column is `w-[85vw]` (with a reasonable min/max)
    // so the next column's edge peeks in — a "there's more here" hint.
    // snap-start lands each column cleanly when swiping. On lg+ we
    // restore the flex-1 share-the-row behavior. The droppable ref is
    // on the inner messages region below — intentionally NOT here, so
    // a drag over the column header doesn't highlight the whole column.
    <div className="flex w-[85vw] min-w-[260px] max-w-[320px] shrink-0 snap-start flex-col rounded-xl border border-border bg-card/60 p-4 lg:w-auto lg:max-w-none lg:flex-1 lg:basis-[260px] lg:shrink lg:snap-none">
      {/* 3px colored top border — sits above the column's padding */}
      <div
        className="-mx-4 -mt-4 h-[3px] rounded-t-xl"
        style={{ backgroundColor: stage.color }}
      />
      <div className="flex items-center justify-between pt-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {stage.name}
          </h3>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {deals.length}
          </span>
        </div>

        {/* Stage Settings Dropdown (Reference image 5) */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="h-6 w-6 rounded-md hover:bg-muted inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-popover border-border">
            <div className="px-2 py-1.5 text-xs font-semibold text-foreground border-b border-border">
              Stage Actions
            </div>
            <DropdownMenuItem
              onClick={() => {
                void loadProfiles();
                setAssigneeModalOpen(true);
              }}
              className="text-xs gap-2 cursor-pointer"
            >
              <UserCheck className="h-3.5 w-3.5 text-primary" />
              Default Assignees
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onAddDeal(stage.id)}
              className="text-xs gap-2 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Deal Here
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={() => toast.info(`Stage: ${stage.name}`)}
              className="text-xs gap-2 cursor-pointer text-muted-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy Stage
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => toast.info("Stage order is managed in Pipeline Settings")}
              className="text-xs gap-2 cursor-pointer text-muted-foreground"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              Reorder Stages
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground mt-0.5">
        <span>{formatCurrency(totalValue, currency)}</span>
        {(() => {
          const assigneeProfile = profiles.find(
            (p) => p.id === (currentAssigneeId ?? stage.default_assignee_id),
          );
          const color = getMemberColor(assigneeProfile?.full_name || stage.default_assignee_id);
          return (
            <button
              type="button"
              onClick={() => {
                void loadProfiles();
                setAssigneeModalOpen(true);
              }}
              className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                assigneeProfile
                  ? `${color.bg} ${color.text} ${color.border}`
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              title="Click to change default assignee"
            >
              {assigneeProfile ? (
                <span
                  className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white shadow-xs"
                  style={{ backgroundColor: color.hex }}
                >
                  {assigneeProfile.full_name?.charAt(0).toUpperCase() || "A"}
                </span>
              ) : (
                <UserCheck className="size-3 text-muted-foreground" />
              )}
              <span className="truncate max-w-[110px]">
                {assigneeProfile?.full_name || "Assignee"}
              </span>
            </button>
          );
        })()}
      </div>

      {/* Default Assignee modal */}
      <Dialog open={assigneeModalOpen} onOpenChange={setAssigneeModalOpen}>
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <UserCheck className="size-4 text-primary" />
              Default Assignee for &quot;{stage.name}&quot;
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              When a deal or contact lands on this stage, automatically assign it to this team member.
            </p>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Select Team Member</Label>
              <select
                value={currentAssigneeId ?? ""}
                onChange={(e) => setCurrentAssigneeId(e.target.value || null)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">-- No default assignee --</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || "Agent"}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAssigneeModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={savingAssignee}
              onClick={() => handleSaveAssignee(currentAssigneeId)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {savingAssignee ? "Saving..." : "Save Default Assignee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div
        ref={setNodeRef}
        className={`mt-3 flex flex-1 flex-col gap-2 rounded-lg transition-all ${
          isOver
            ? "bg-primary/5 outline outline-2 outline-dashed outline-primary outline-offset-2"
            : ""
        }`}
      >
        {deals.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-border py-10 text-xs text-muted-foreground">
            {t("dropDealHere")}
          </div>
        ) : (
          deals.map((deal) => (
            <DraggableDealCard
              key={deal.id}
              deal={deal}
              stage={stage}
              onEdit={onEditDeal}
            />
          ))
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onAddDeal(stage.id)}
        className="mt-3 w-full justify-start border border-dashed border-border bg-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
      >
        <Plus className="mr-1 h-3 w-3" />
        {t("addDeal")}
      </Button>
    </div>
  );
}

function DraggableDealCard({
  deal,
  stage,
  onEdit,
}: {
  deal: Deal;
  stage: PipelineStage;
  onEdit: (deal: Deal) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.3 : 1, touchAction: "none" }}
    >
      <DealCard deal={deal} stage={stage} onEdit={onEdit} />
    </div>
  );
}
