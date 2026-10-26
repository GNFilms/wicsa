"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Task, TaskPriority, TaskStatus, Contact } from "@/types";
import {
  Settings,
  Plus,
  Calendar,
  CheckCircle2,
  Circle,
  ExternalLink,
  ChevronDown,
  UserCheck,
  UserPlus,
  Bell,
  Clock,
  AlertCircle,
  Loader2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, isPast } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type TabKey = "assigned" | "upcoming" | "overdue" | "mentioned" | "completed" | "others" | "leads" | "notifications";

interface LeadItem {
  id: string;
  name: string | null;
  phone: string;
  company: string | null;
  created_at: string;
}

interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  at: string;
  href: string;
}

export function DashboardAlertsSection() {
  const router = useRouter();
  const { user, accountId } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("assigned");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  // New task dialog
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskCategory, setTaskCategory] = useState("GNF Tasks - Delivered");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("low");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);

  // Configure tabs dialog
  const [configOpen, setConfigOpen] = useState(false);
  const [visibleTabs, setVisibleTabs] = useState<Record<TabKey, boolean>>({
    assigned: true,
    upcoming: true,
    overdue: true,
    mentioned: true,
    completed: true,
    others: true,
    leads: true,
    notifications: true,
  });

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks?limit=50");
      if (res.ok) {
        const data = await res.json();
        if (data.tasks) {
          setTasks(data.tasks);
        }
      }
    } catch (err) {
      console.error("[DashboardAlertsSection] fetchTasks error:", err);
    }
  }, []);

  // Fetch new leads & notifications
  const fetchLeadsAndAlerts = useCallback(async () => {
    try {
      const supabase = createClient();

      // Recent leads / contacts
      const { data: contactsData } = await supabase
        .from("contacts")
        .select("id, name, phone, company, created_at")
        .order("created_at", { ascending: false })
        .limit(10);

      if (contactsData) {
        setLeads(contactsData as LeadItem[]);
      }

      // Recent inbound messages as notifications
      const { data: msgsData } = await supabase
        .from("messages")
        .select("id, content_text, created_at, conversation_id, sender_type")
        .eq("sender_type", "customer")
        .order("created_at", { ascending: false })
        .limit(10);

      if (msgsData) {
        const notifs: NotificationItem[] = msgsData.map((m) => ({
          id: m.id,
          title: "New Incoming Message",
          detail: m.content_text || "Attachment or media message received",
          at: m.created_at,
          href: `/inbox?c=${m.conversation_id}`,
        }));
        setNotifications(notifs);
      }
    } catch (err) {
      console.error("[DashboardAlertsSection] fetchLeadsAndAlerts error:", err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchTasks(), fetchLeadsAndAlerts()]).finally(() => {
      setLoading(false);
    });
  }, [fetchTasks, fetchLeadsAndAlerts]);

  // Toggle task complete status
  const handleToggleTaskStatus = async (task: Task) => {
    const newStatus: TaskStatus = task.status === "completed" ? "assigned" : "completed";
    const prevTasks = [...tasks];
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
    );

    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        // Rollback
        setTasks(prevTasks);
        toast.error("Failed to update task status");
      } else {
        toast.success(newStatus === "completed" ? "Task marked as completed" : "Task reopened");
      }
    } catch (err) {
      setTasks(prevTasks);
      toast.error("Network error updating task");
    }
  };

  // Create new task
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) {
      toast.error("Please enter a task title");
      return;
    }

    setCreatingTask(true);
    try {
      const payload = {
        title: taskTitle.trim(),
        category: taskCategory.trim() || "GNF Tasks",
        priority: taskPriority,
        due_date: taskDueDate ? new Date(taskDueDate).toISOString() : new Date(Date.now() + 86400000).toISOString(),
        status: "assigned" as TaskStatus,
      };

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.task) {
          setTasks((prev) => [data.task, ...prev]);
        }
        toast.success("Task created successfully");
        setTaskTitle("");
        setTaskDueDate("");
        setNewTaskOpen(false);
      } else {
        toast.error("Failed to create task");
      }
    } catch (err) {
      toast.error("Failed to create task");
    } finally {
      setCreatingTask(false);
    }
  };

  // Filter tasks by active tab
  const filteredTasks = useMemo(() => {
    if (activeTab === "assigned") {
      return tasks.filter((t) => t.status === "assigned" || !t.status);
    }
    if (activeTab === "upcoming") {
      return tasks.filter((t) => t.status === "upcoming" || (t.status !== "completed" && t.due_date && !isPast(new Date(t.due_date))));
    }
    if (activeTab === "overdue") {
      return tasks.filter((t) => t.status !== "completed" && t.due_date && isPast(new Date(t.due_date)));
    }
    if (activeTab === "mentioned") {
      return tasks.filter((t) => t.status === "mentioned");
    }
    if (activeTab === "completed") {
      return tasks.filter((t) => t.status === "completed");
    }
    if (activeTab === "others") {
      return tasks.filter((t) => t.status === "others" || !["assigned", "upcoming", "completed"].includes(t.status));
    }
    return tasks;
  }, [tasks, activeTab]);

  const displayedTasks = showAll ? filteredTasks : filteredTasks.slice(0, 5);

  const formatDueDate = (dateStr?: string | null) => {
    if (!dateStr) return "No due date";
    try {
      const d = new Date(dateStr);
      return format(d, "d MMM '@' hh:mm a");
    } catch {
      return dateStr;
    }
  };

  const priorityColor = (p?: TaskPriority) => {
    switch (p) {
      case "urgent":
        return "text-red-500 bg-red-500";
      case "high":
        return "text-amber-500 bg-amber-500";
      case "medium":
        return "text-blue-500 bg-blue-500";
      default:
        return "text-emerald-500 bg-emerald-500";
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-xs">
      {/* Header bar matching screenshot 5 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border/80 px-6 py-4 gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">My Tasks</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage your daily pipeline tasks, assigned leads & live notifications
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* New Task Dialog Trigger */}
          <Dialog open={newTaskOpen} onOpenChange={setNewTaskOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5 bg-primary text-xs font-medium hover:bg-primary/90">
                <Plus className="h-3.5 w-3.5" />
                New Task
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create New Task</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateTask} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Task Title *</Label>
                  <Input
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="e.g. Lata Services - Sales & service"
                    className="h-8 text-xs"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <Input
                    value={taskCategory}
                    onChange={(e) => setTaskCategory(e.target.value)}
                    placeholder="e.g. GNF Tasks - Delivered"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Priority</Label>
                    <Select
                      value={taskPriority}
                      onValueChange={(val) => setTaskPriority(val as TaskPriority)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Due Date & Time</Label>
                    <Input
                      type="datetime-local"
                      value={taskDueDate}
                      onChange={(e) => setTaskDueDate(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setNewTaskOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    className="h-8 text-xs bg-primary hover:bg-primary/90"
                    disabled={creatingTask}
                  >
                    {creatingTask ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Save Task
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {/* Configure Tabs Button */}
          <Dialog open={configOpen} onOpenChange={setConfigOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground border-border"
              >
                <Settings className="h-3.5 w-3.5" />
                Configure Tabs
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[360px]">
              <DialogHeader>
                <DialogTitle>Configure Dashboard Tabs</DialogTitle>
              </DialogHeader>
              <div className="space-y-2.5 pt-2">
                {(Object.keys(visibleTabs) as TabKey[]).map((tab) => (
                  <label
                    key={tab}
                    className="flex items-center justify-between p-2 rounded-lg border border-border/70 hover:bg-muted/40 cursor-pointer text-xs capitalize"
                  >
                    <span className="font-medium text-foreground">{tab}</span>
                    <input
                      type="checkbox"
                      checked={visibleTabs[tab]}
                      onChange={() =>
                        setVisibleTabs((prev) => ({ ...prev, [tab]: !prev[tab] }))
                      }
                      className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                    />
                  </label>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tabs Row matching screenshot 5 */}
      <div className="flex border-b border-border/80 px-6 overflow-x-auto scrollbar-none">
        <div className="flex gap-7 text-xs font-medium">
          {visibleTabs.assigned && (
            <button
              onClick={() => setActiveTab("assigned")}
              className={cn(
                "py-3.5 border-b-2 transition-colors relative whitespace-nowrap",
                activeTab === "assigned"
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Assigned
            </button>
          )}

          {visibleTabs.upcoming && (
            <button
              onClick={() => setActiveTab("upcoming")}
              className={cn(
                "py-3.5 border-b-2 transition-colors relative whitespace-nowrap",
                activeTab === "upcoming"
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Upcoming
            </button>
          )}

          {visibleTabs.overdue && (
            <button
              onClick={() => setActiveTab("overdue")}
              className={cn(
                "py-3.5 border-b-2 transition-colors relative whitespace-nowrap",
                activeTab === "overdue"
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Overdue
            </button>
          )}

          {visibleTabs.mentioned && (
            <button
              onClick={() => setActiveTab("mentioned")}
              className={cn(
                "py-3.5 border-b-2 transition-colors relative whitespace-nowrap",
                activeTab === "mentioned"
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Mentioned
            </button>
          )}

          {visibleTabs.completed && (
            <button
              onClick={() => setActiveTab("completed")}
              className={cn(
                "py-3.5 border-b-2 transition-colors relative whitespace-nowrap",
                activeTab === "completed"
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Completed
            </button>
          )}

          {visibleTabs.others && (
            <button
              onClick={() => setActiveTab("others")}
              className={cn(
                "py-3.5 border-b-2 transition-colors relative whitespace-nowrap",
                activeTab === "others"
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Others
            </button>
          )}

          {visibleTabs.leads && (
            <button
              onClick={() => setActiveTab("leads")}
              className={cn(
                "py-3.5 border-b-2 transition-colors relative whitespace-nowrap flex items-center gap-1.5",
                activeTab === "leads"
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <UserPlus className="h-3.5 w-3.5" />
              New Leads
              <span className="rounded-full bg-primary/10 text-primary px-1.5 py-0.2 text-[10px]">
                {leads.length}
              </span>
            </button>
          )}

          {visibleTabs.notifications && (
            <button
              onClick={() => setActiveTab("notifications")}
              className={cn(
                "py-3.5 border-b-2 transition-colors relative whitespace-nowrap flex items-center gap-1.5",
                activeTab === "notifications"
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Bell className="h-3.5 w-3.5" />
              Notifications
              <span className="rounded-full bg-amber-500/10 text-amber-500 px-1.5 py-0.2 text-[10px]">
                {notifications.length}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Task Rows List - Pixel Perfect to Screenshot 5 */}
      <div className="p-4 sm:p-6 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : activeTab === "leads" ? (
          /* New Leads List with Direct Connected Link */
          <div className="space-y-2.5">
            {leads.length === 0 ? (
              <p className="text-center py-8 text-xs text-muted-foreground">No new leads yet</p>
            ) : (
              leads.map((lead) => (
                <div
                  key={lead.id}
                  onClick={() => router.push(`/inbox?c=${lead.id}`)}
                  className="group flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-lg border border-border/80 bg-muted/20 hover:bg-muted/50 hover:border-primary/40 cursor-pointer transition-all gap-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 text-primary font-semibold text-xs flex items-center justify-center shrink-0">
                      {lead.name ? lead.name.charAt(0).toUpperCase() : lead.phone.slice(-2)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                        {lead.name || lead.phone}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {lead.company ? `${lead.company} • ` : ""}Phone: {lead.phone}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(lead.created_at), "d MMM, h:mm a")}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-primary gap-1 px-2 group-hover:bg-primary/10"
                    >
                      Open Chat
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : activeTab === "notifications" ? (
          /* Notifications List with Connected Link */
          <div className="space-y-2.5">
            {notifications.length === 0 ? (
              <p className="text-center py-8 text-xs text-muted-foreground">No recent notifications</p>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => router.push(notif.href)}
                  className="group flex items-start justify-between p-3.5 rounded-lg border border-border/80 bg-muted/20 hover:bg-muted/50 hover:border-primary/40 cursor-pointer transition-all gap-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0 mt-0.5">
                      <Bell className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                        {notif.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {notif.detail}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-muted-foreground">
                      {format(new Date(notif.at), "h:mm a")}
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                  </div>
                </div>
              ))
            )}
          </div>
        ) : displayedTasks.length === 0 ? (
          <p className="text-center py-8 text-xs text-muted-foreground">
            No tasks found in this section
          </p>
        ) : (
          displayedTasks.map((task) => (
            <div
              key={task.id}
              className="group relative flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-border/70 bg-card p-3.5 transition-all hover:border-primary/40 hover:bg-muted/30 hover:shadow-xs gap-3"
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {/* Completion Checkbox */}
                <button
                  type="button"
                  onClick={() => handleToggleTaskStatus(task)}
                  className="mt-1 text-muted-foreground hover:text-primary transition-colors shrink-0"
                >
                  {task.status === "completed" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground/80 hover:text-primary" />
                  )}
                </button>

                <div className="space-y-1.5 min-w-0 flex-1">
                  {/* Category Pill matching screenshot 5 */}
                  {task.category && (
                    <span className="inline-block rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {task.category}
                    </span>
                  )}

                  {/* Task Title */}
                  <h4
                    onClick={() => {
                      if (task.conversation_id) {
                        router.push(`/inbox?c=${task.conversation_id}`);
                      } else if (task.contact_id) {
                        router.push(`/inbox?c=${task.contact_id}`);
                      } else {
                        router.push("/inbox");
                      }
                    }}
                    className={cn(
                      "text-sm font-semibold text-foreground hover:text-primary cursor-pointer transition-colors truncate block",
                      task.status === "completed" && "line-through text-muted-foreground"
                    )}
                  >
                    {task.title}
                  </h4>

                  {/* Meta row: Priority & Due Date */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 font-medium capitalize">
                      <span className={cn("h-1.5 w-1.5 rounded-full", priorityColor(task.priority).split(" ")[1])} />
                      {task.priority || "Low"}
                    </span>

                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      Due Date: {formatDueDate(task.due_date)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right side: Assignee avatars stacked (as in screenshot 5) */}
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <div className="flex items-center -space-x-1.5 overflow-hidden">
                  <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted-foreground/20 text-[10px] font-bold text-foreground ring-2 ring-card">
                    CE
                  </div>
                  <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary ring-2 ring-card">
                    Sh
                  </div>
                  <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground ring-2 ring-card">
                    +1
                  </div>
                </div>

                <Link
                  href={task.conversation_id ? `/inbox?c=${task.conversation_id}` : "/inbox"}
                  className="rounded p-1 text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                  title="Open connected section"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))
        )}

        {/* See more button matching screenshot 5 */}
        {filteredTasks.length > 5 && activeTab !== "leads" && activeTab !== "notifications" && (
          <div className="pt-2 text-center">
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
            >
              {showAll ? "Show less" : "See more"}
              <ChevronDown className={cn("h-3 w-3 transition-transform", showAll && "rotate-180")} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
