"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import type { Deal, PipelineStage, Profile } from "@/types";
import {
  Clock,
  ArrowRight,
  UserCheck,
  CheckCircle2,
  FileText,
  Calendar,
  Sparkles,
  Loader2,
  Tag as TagIcon,
} from "lucide-react";

export interface DealActivity {
  id: string;
  deal_id: string;
  user_id?: string | null;
  account_id?: string | null;
  activity_type:
    | "created"
    | "stage_change"
    | "assignee_change"
    | "description_update"
    | "due_date_change"
    | "status_change"
    | "value_change";
  actor_name: string;
  details?: Record<string, any>;
  created_at: string;
}

interface DealActivitiesProps {
  dealId: string;
  deal: Deal;
  stages: PipelineStage[];
  profiles: Profile[];
}

function formatRelativeTime(dateStr: string) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return "recently";
  }
}

export function DealActivities({
  dealId,
  deal,
  stages,
  profiles,
}: DealActivitiesProps) {
  const [activities, setActivities] = useState<DealActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  const fetchActivities = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/deals/activities?deal_id=${dealId}&sort=${sortOrder}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Failed to load activities");
      const data = await res.json();
      setActivities(data.activities || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [dealId, sortOrder]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  // Combine fetched activities with synthesized baseline activities
  // so the user immediately sees creation and status history even before new edits.
  const displayActivities = useMemo(() => {
    if (activities.length > 0) {
      return activities;
    }

    // Baseline fallback synthesized from deal properties
    const stageName =
      stages.find((s) => s.id === deal.stage_id)?.name || "Initial Stage";
    const assigneeName =
      deal.assignee?.full_name ||
      profiles.find((p) => p.id === deal.assigned_to)?.full_name ||
      null;

    const list: DealActivity[] = [
      {
        id: `base-created-${deal.id}`,
        deal_id: deal.id,
        activity_type: "created",
        actor_name: assigneeName || "Team Member",
        details: { title: deal.title },
        created_at: deal.created_at || new Date().toISOString(),
      },
    ];

    if (assigneeName) {
      list.push({
        id: `base-assignee-${deal.id}`,
        deal_id: deal.id,
        activity_type: "assignee_change",
        actor_name: assigneeName,
        details: { to_assignee: assigneeName },
        created_at: deal.created_at || new Date().toISOString(),
      });
    }

    if (deal.notes) {
      list.push({
        id: `base-notes-${deal.id}`,
        deal_id: deal.id,
        activity_type: "description_update",
        actor_name: assigneeName || "Team Member",
        details: {},
        created_at: deal.updated_at || deal.created_at || new Date().toISOString(),
      });
    }

    if (deal.status && deal.status !== "open") {
      list.push({
        id: `base-status-${deal.id}`,
        deal_id: deal.id,
        activity_type: "status_change",
        actor_name: assigneeName || "Team Member",
        details: { status: deal.status },
        created_at: deal.updated_at || new Date().toISOString(),
      });
    }

    return sortOrder === "newest" ? list.reverse() : list;
  }, [activities, deal, stages, profiles, sortOrder]);

  return (
    <div className="mt-6 border-t border-border pt-5 space-y-3">
      {/* Header with Sort Selector */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <span>All activities</span>
        </h4>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
          className="h-7 text-xs rounded-md border border-input bg-background px-2.5 text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground gap-2">
          <Loader2 className="size-4 animate-spin text-primary" />
          <span>Loading activity history...</span>
        </div>
      ) : displayActivities.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          No activities recorded for this deal yet.
        </div>
      ) : (
        <div className="space-y-2">
          {displayActivities.map((act) => {
            const actor = act.actor_name || "User";
            const initial = actor.charAt(0).toUpperCase();

            return (
              <div
                key={act.id}
                className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/30 p-2.5 transition-colors hover:bg-muted/50"
              >
                {/* Circular Avatar */}
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
                  {initial}
                </div>

                {/* Event text & timestamp */}
                <div className="min-w-0 flex-1 text-xs">
                  <div className="text-foreground leading-relaxed">
                    <span className="font-semibold text-foreground mr-1">
                      {actor}
                    </span>

                    {act.activity_type === "stage_change" && (
                      <span>
                        changed stage from{" "}
                        {act.details?.from_stage && (
                          <span className="line-through text-muted-foreground mr-1">
                            {act.details.from_stage}
                          </span>
                        )}{" "}
                        to{" "}
                        <span className="font-semibold text-foreground">
                          {act.details?.to_stage || "new stage"}
                        </span>
                        .
                      </span>
                    )}

                    {act.activity_type === "assignee_change" && (
                      <span>
                        {act.details?.to_assignee ? (
                          <>
                            added assignee{" "}
                            <span className="font-semibold text-foreground">
                              {act.details.to_assignee}
                            </span>
                            .
                          </>
                        ) : (
                          "removed assignee."
                        )}
                      </span>
                    )}

                    {act.activity_type === "description_update" && (
                      <span>Updated description.</span>
                    )}

                    {act.activity_type === "due_date_change" && (
                      <span>
                        added Due Date{" "}
                        <span className="font-semibold text-foreground">
                          {act.details?.date}
                        </span>
                        .
                      </span>
                    )}

                    {act.activity_type === "status_change" && (
                      <span>
                        marked deal as{" "}
                        <span
                          className={`font-semibold capitalize ${
                            act.details?.status === "won"
                              ? "text-emerald-500"
                              : act.details?.status === "lost"
                              ? "text-rose-500"
                              : "text-primary"
                          }`}
                        >
                          {act.details?.status || "open"}
                        </span>
                        .
                      </span>
                    )}

                    {act.activity_type === "created" && (
                      <span>
                        created deal{" "}
                        <span className="font-semibold text-foreground">
                          {act.details?.title || deal.title}
                        </span>
                        .
                      </span>
                    )}

                    {act.activity_type === "value_change" && (
                      <span>
                        updated value to{" "}
                        <span className="font-semibold text-foreground">
                          {act.details?.value}
                        </span>
                        .
                      </span>
                    )}
                  </div>

                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatRelativeTime(act.created_at)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
