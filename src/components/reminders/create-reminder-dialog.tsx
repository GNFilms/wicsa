"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import {
  Calendar as CalendarIcon,
  Clock,
  Flag,
  StickyNote,
  UserCheck,
  Bell,
  Loader2,
  PhoneCall,
  CreditCard,
  PackageCheck,
  Sparkles,
  Check,
} from "lucide-react";
import type { Contact, Task, TaskPriority } from "@/types";

interface CreateReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact | null;
  conversationId?: string | null;
  onSaved?: (task: Task) => void;
}

const PRESET_CATEGORIES = [
  { id: "call", label: "Client's Call Reminder", icon: PhoneCall, defaultTitle: "Call client to follow up" },
  { id: "payment", label: "Payment Reminder", icon: CreditCard, defaultTitle: "Follow up on pending payment" },
  { id: "order", label: "Order Confirmation Reminder", icon: PackageCheck, defaultTitle: "Confirm order details & delivery" },
  { id: "custom", label: "Custom Reminder", icon: Sparkles, defaultTitle: "" },
];

export function CreateReminderDialog({
  open,
  onOpenChange,
  contact,
  conversationId,
  onSaved,
}: CreateReminderDialogProps) {
  const { user, profile } = useAuth();

  const [mode, setMode] = useState<"reminder" | "task">("reminder");
  const [categoryType, setCategoryType] = useState<string>("call");
  const [customCategory, setCustomCategory] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("14:00");
  const [endDate, setEndDate] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("15:00");
  const [allDay, setAllDay] = useState<boolean>(false);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [notes, setNotes] = useState<string>("");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [notify, setNotify] = useState<boolean>(true);
  const [notifyMinutes, setNotifyMinutes] = useState<number>(5);
  const [saving, setSaving] = useState<boolean>(false);

  // Members list
  const [members, setMembers] = useState<{ user_id: string; full_name?: string; email?: string }[]>([]);

  useEffect(() => {
    if (open) {
      // Default to today
      const today = new Date().toISOString().split("T")[0];
      setStartDate(today);
      setEndDate(today);

      const contactName = contact?.name || contact?.phone || "client";
      setTitle(`Call ${contactName} to follow up`);
      setCategoryType("call");
      setCustomCategory("");
      setNotes("");
      setPriority("medium");
      setAllDay(false);
      setMode("reminder");

      if (user?.id) {
        setAssignedTo(user.id);
      }

      // Load members
      fetch("/api/account/members", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.members) {
            setMembers(data.members);
          }
        })
        .catch(() => {});
    }
  }, [open, contact, user?.id]);

  const handleCategorySelect = (catId: string) => {
    setCategoryType(catId);
    const cat = PRESET_CATEGORIES.find((c) => c.id === catId);
    const contactName = contact?.name || contact?.phone || "client";

    if (catId === "call") {
      setTitle(`Call ${contactName} to follow up`);
    } else if (catId === "payment") {
      setTitle(`Payment reminder: Follow up with ${contactName}`);
    } else if (catId === "order") {
      setTitle(`Order confirmation for ${contactName}`);
    } else if (catId === "custom") {
      if (!title || PRESET_CATEGORIES.some((c) => c.defaultTitle && title.startsWith(c.defaultTitle.split(" ")[0]))) {
        setTitle("");
      }
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Please enter a title for this reminder");
      return;
    }

    setSaving(true);
    try {
      let resolvedCategory = "Client's Call Reminder";
      if (categoryType === "payment") resolvedCategory = "Payment Reminder";
      else if (categoryType === "order") resolvedCategory = "Order Confirmation Reminder";
      else if (categoryType === "custom") resolvedCategory = customCategory.trim() || "Custom Reminder";

      let dueDateTime: string | null = null;
      if (startDate) {
        if (allDay) {
          dueDateTime = `${startDate}T23:59:59.000Z`;
        } else {
          dueDateTime = `${startDate}T${startTime || "12:00"}:00.000Z`;
        }
      }

      const payload = {
        title: title.trim(),
        category: `${mode === "task" ? "[Task] " : ""}${resolvedCategory}`,
        description: notes.trim() || null,
        contact_id: contact?.id || null,
        conversation_id: conversationId || null,
        assigned_to_user_id: assignedTo || user?.id || null,
        due_date: dueDateTime,
        priority: priority,
        status: "assigned",
      };

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to create reminder");
      }

      const json = await res.json();
      toast.success(
        mode === "reminder"
          ? "Reminder created successfully!"
          : "Task created successfully!"
      );
      if (onSaved && json.task) {
        onSaved(json.task);
      }
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to create reminder");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto bg-card text-card-foreground border-border p-6">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-lg font-bold">
                  {mode === "reminder" ? "Create Reminder" : "Create Task"}
                </DialogTitle>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/20">
                  {contact ? contact.name || contact.phone : "General"}
                </span>
              </div>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Set follow-up date, time, notifications, and notes in one place.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Card: Basics & Type */}
          <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Basics
              </Label>
              <div className="flex rounded-lg bg-muted p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setMode("reminder")}
                  className={`rounded-md px-3 py-1 font-medium transition-colors ${
                    mode === "reminder"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Reminder
                </button>
                <button
                  type="button"
                  onClick={() => setMode("task")}
                  className={`rounded-md px-3 py-1 font-medium transition-colors ${
                    mode === "task"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Task
                </button>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Preset Reminder Type</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PRESET_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = categoryType === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleCategorySelect(cat.id)}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-center transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/30"
                          : "border-border/70 bg-card hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-[11px] leading-tight">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {categoryType === "custom" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Custom Reminder Category</Label>
                <Input
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="e.g. Contract Renewal, Document Followup..."
                  className="text-xs"
                />
              </div>
            )}

            {/* Title */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Title / Reminder Note</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What should this remind you about?"
                className="text-sm font-medium"
              />
            </div>
          </div>

          {/* Card: Schedule */}
          <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Schedule
                </span>
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
                <span>All day</span>
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary size-4"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Starts</Label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="text-xs flex-1"
                  />
                  {!allDay && (
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="text-xs w-28"
                    />
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Ends / Due</Label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="text-xs flex-1"
                  />
                  {!allDay && (
                    <Input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="text-xs w-28"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Card: Priority & Notes */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Priority */}
            <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-2 sm:col-span-1">
              <div className="flex items-center gap-1.5">
                <Flag className="h-3.5 w-3.5 text-amber-500" />
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Priority
                </Label>
              </div>
              <div className="flex flex-col gap-1.5 pt-1">
                {(["low", "medium", "high"] as TaskPriority[]).map((p) => {
                  const isSel = priority === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-xs capitalize transition-colors ${
                        isSel
                          ? p === "high"
                            ? "bg-red-500/20 text-red-400 font-semibold border border-red-500/40"
                            : p === "medium"
                            ? "bg-amber-500/20 text-amber-400 font-semibold border border-amber-500/40"
                            : "bg-blue-500/20 text-blue-400 font-semibold border border-blue-500/40"
                          : "bg-card border border-border/60 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <span>{p}</span>
                      {isSel && <Check className="h-3 w-3" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notes */}
            <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-2 sm:col-span-2">
              <div className="flex items-center gap-1.5">
                <StickyNote className="h-3.5 w-3.5 text-primary" />
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Notes & Details
                </Label>
              </div>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add supporting details, context, checklist or call points..."
                className="min-h-[85px] text-xs resize-none"
              />
            </div>
          </div>

          {/* Card: Assignee & Notifications */}
          <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Assigned To */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5 text-primary" />
                  <Label className="text-xs font-medium text-foreground">Assigned to</Label>
                </div>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                >
                  <option value={user?.id || ""}>
                    {profile?.full_name ? `${profile.full_name} (Me)` : "Assign to Me"}
                  </option>
                  {members
                    .filter((m) => m.user_id !== user?.id)
                    .map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.full_name || m.email || m.user_id}
                      </option>
                    ))}
                </select>
              </div>

              {/* Notifications */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Bell className="h-3.5 w-3.5 text-primary" />
                    <Label className="text-xs font-medium text-foreground">Notification alert</Label>
                  </div>
                  <input
                    type="checkbox"
                    checked={notify}
                    onChange={(e) => setNotify(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary size-4"
                  />
                </div>
                {notify ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={notifyMinutes}
                      onChange={(e) => setNotifyMinutes(Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                    >
                      <option value={5}>5 Minutes before</option>
                      <option value={10}>10 Minutes before</option>
                      <option value={15}>15 Minutes before</option>
                      <option value={30}>30 Minutes before</option>
                      <option value={60}>1 Hour before</option>
                      <option value={1440}>1 Day before</option>
                    </select>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground pt-1">
                    Notifications muted for this item
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save Reminder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
