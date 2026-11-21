"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  PhoneCall,
  CreditCard,
  PackageCheck,
  CheckCircle2,
  Circle,
  X,
  Bell,
  CheckSquare,
  Filter,
  MessageSquare,
  Flame,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task, Contact, TaskPriority } from "@/types";
import { CreateReminderDialog } from "./create-reminder-dialog";

interface ReminderCalendarModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact | null;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const DAYS_HEADER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function getTaskCategoryInfo(task: Task) {
  const cat = (task.category || "").toLowerCase();
  const title = (task.title || "").toLowerCase();

  if (cat.includes("call") || title.includes("call")) {
    return {
      type: "call",
      label: "Call",
      icon: PhoneCall,
      color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500/25",
      badgeColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      dotColor: "bg-blue-500",
    };
  }
  if (cat.includes("payment") || title.includes("payment") || title.includes("pay")) {
    return {
      type: "payment",
      label: "Payment",
      icon: CreditCard,
      color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25",
      badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      dotColor: "bg-emerald-500",
    };
  }
  if (cat.includes("order") || title.includes("order")) {
    return {
      type: "order",
      label: "Order",
      icon: PackageCheck,
      color: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30 hover:bg-purple-500/25",
      badgeColor: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
      dotColor: "bg-purple-500",
    };
  }
  if (cat.includes("task") || cat.includes("todo")) {
    return {
      type: "task",
      label: "Task",
      icon: CheckSquare,
      color: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/25",
      badgeColor: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
      dotColor: "bg-indigo-500",
    };
  }
  return {
    type: "reminder",
    label: "Reminder",
    icon: Bell,
    color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/25",
    badgeColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    dotColor: "bg-amber-500",
  };
}

function formatTaskTime(dueDateStr?: string | null): string | null {
  if (!dueDateStr) return null;
  try {
    const d = new Date(dueDateStr);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return null;
  }
}

export function ReminderCalendarModal({
  open,
  onOpenChange,
  contact,
}: ReminderCalendarModalProps) {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");
  const [createOpen, setCreateOpen] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  const handleTaskClick = (task: Task) => {
    onOpenChange(false);
    const conversationId = task.conversation_id || null;
    const contactId = task.contact_id || task.contact?.id || null;
    const phone = task.contact?.phone || null;

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("wacrm:open-chat", {
          detail: {
            conversationId,
            contactId,
            phone,
            task,
          },
        })
      );
    }

    if (conversationId) {
      router.push(`/inbox?c=${conversationId}`);
      return;
    }
    if (contactId) {
      router.push(`/inbox?contactId=${contactId}`);
      return;
    }
    router.push(`/inbox`);
  };

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks?limit=150", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json.tasks) setTasks(json.tasks);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchTasks();
    }
  }, [open]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const handlePrev = () => {
    if (viewMode === "month") {
      setCurrentDate(new Date(year, month - 1, 1));
    } else if (viewMode === "week") {
      const prev = new Date(currentDate);
      prev.setDate(prev.getDate() - 7);
      setCurrentDate(prev);
    } else {
      const prev = new Date(currentDate);
      prev.setDate(prev.getDate() - 1);
      setCurrentDate(prev);
    }
  };

  const handleNext = () => {
    if (viewMode === "month") {
      setCurrentDate(new Date(year, month + 1, 1));
    } else if (viewMode === "week") {
      const next = new Date(currentDate);
      next.setDate(next.getDate() + 7);
      setCurrentDate(next);
    } else {
      const next = new Date(currentDate);
      next.setDate(next.getDate() + 1);
      setCurrentDate(next);
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Filter counts
  const counts = useMemo(() => {
    let calls = 0;
    let payments = 0;
    let orders = 0;
    let tasksCount = 0;
    let reminders = 0;
    let high = 0;
    let completed = 0;
    let pending = 0;

    tasks.forEach((t) => {
      const info = getTaskCategoryInfo(t);
      if (info.type === "call") calls++;
      else if (info.type === "payment") payments++;
      else if (info.type === "order") orders++;
      else if (info.type === "task") tasksCount++;
      else reminders++;

      if (t.priority === "high") high++;
      if (t.status === "completed") completed++;
      else pending++;
    });

    return {
      total: tasks.length,
      calls,
      payments,
      orders,
      tasksCount,
      reminders,
      high,
      completed,
      pending,
    };
  }, [tasks]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const info = getTaskCategoryInfo(t);
      if (typeFilter !== "all" && info.type !== typeFilter) return false;
      if (statusFilter === "pending" && t.status === "completed") return false;
      if (statusFilter === "completed" && t.status !== "completed") return false;
      if (priorityFilter === "high" && t.priority !== "high") return false;
      return true;
    });
  }, [tasks, typeFilter, statusFilter, priorityFilter]);

  // Month matrix (Monday-start)
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    let startingDayOfWeek = firstDay.getDay() - 1;
    if (startingDayOfWeek === -1) startingDayOfWeek = 6;

    const days = [];
    const prevMonthLastDay = new Date(year, month, 0).getDate();

    // Days from prev month
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({
        dateNumber: prevMonthLastDay - i,
        isCurrentMonth: false,
        fullDateString: new Date(year, month - 1, prevMonthLastDay - i).toISOString().split("T")[0],
      });
    }

    // Days of current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const dStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
      days.push({
        dateNumber: i,
        isCurrentMonth: true,
        fullDateString: dStr,
      });
    }

    // Fill remaining
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        dateNumber: i,
        isCurrentMonth: false,
        fullDateString: new Date(year, month + 1, i).toISOString().split("T")[0],
      });
    }

    return days;
  }, [year, month]);

  // Week days (7 days starting Monday)
  const weekDays = useMemo(() => {
    const curr = new Date(currentDate);
    const dayOfWeek = (curr.getDay() + 6) % 7; // Mon=0, Sun=6
    const monday = new Date(curr);
    monday.setDate(curr.getDate() - dayOfWeek);

    const result = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      result.push({
        date: d,
        dateNumber: d.getDate(),
        dayName: DAYS_HEADER[i],
        fullDateString: dStr,
      });
    }
    return result;
  }, [currentDate]);

  const todayStr = new Date().toISOString().split("T")[0];

  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    filteredTasks.forEach((t) => {
      if (t.due_date) {
        const d = t.due_date.split("T")[0];
        if (!map[d]) map[d] = [];
        map[d].push(t);
      }
    });
    return map;
  }, [filteredTasks]);

  const hasActiveFilter =
    typeFilter !== "all" || statusFilter !== "all" || priorityFilter !== "all";

  // Selected date string for day view
  const selectedDateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`;
  const dayTasksList = tasksByDate[selectedDateStr] || [];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-5xl w-[96vw] max-h-[92vh] overflow-hidden flex flex-col bg-card text-card-foreground border-border p-5">
          <DialogHeader className="shrink-0 pb-3 border-b border-border">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CalendarIcon className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold">Calendar & Reminders</DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {viewMode === "month" && `${MONTH_NAMES[month]} ${year}`}
                    {viewMode === "week" &&
                      `Week of ${weekDays[0].date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${weekDays[6].date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}
                    {viewMode === "day" &&
                      currentDate.toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                  className="gap-1.5 shadow-sm bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-xs"
                >
                  <Plus className="h-4 w-4" />
                  Create Reminder / Task
                </Button>
              </div>
            </div>

            {/* Navigation, Filter Bar & View Modes Toolbar */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 pt-2">
              {/* Prev / Today / Next Controls */}
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="icon-sm" onClick={handlePrev} title="Previous">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={handleToday} className="text-xs font-semibold px-2.5 h-8">
                  Today
                </Button>
                <Button variant="outline" size="icon-sm" onClick={handleNext} title="Next">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Interactive Type Filter List */}
              <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border/70 bg-muted/30 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setTypeFilter("all")}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    typeFilter === "all"
                      ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <span>All</span>
                  <span className="text-[10px] opacity-80">({counts.total})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTypeFilter("call")}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    typeFilter === "call"
                      ? "bg-blue-600 text-white shadow-xs font-semibold"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <PhoneCall className="h-3 w-3" />
                  <span>Calls</span>
                  <span className="text-[10px] opacity-80">({counts.calls})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTypeFilter("payment")}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    typeFilter === "payment"
                      ? "bg-emerald-600 text-white shadow-xs font-semibold"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <CreditCard className="h-3 w-3" />
                  <span>Payments</span>
                  <span className="text-[10px] opacity-80">({counts.payments})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTypeFilter("order")}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    typeFilter === "order"
                      ? "bg-purple-600 text-white shadow-xs font-semibold"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <PackageCheck className="h-3 w-3" />
                  <span>Orders</span>
                  <span className="text-[10px] opacity-80">({counts.orders})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTypeFilter("reminder")}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    typeFilter === "reminder"
                      ? "bg-amber-600 text-white shadow-xs font-semibold"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Bell className="h-3 w-3" />
                  <span>Reminders</span>
                  <span className="text-[10px] opacity-80">({counts.reminders})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTypeFilter("task")}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    typeFilter === "task"
                      ? "bg-indigo-600 text-white shadow-xs font-semibold"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <CheckSquare className="h-3 w-3" />
                  <span>Tasks</span>
                  <span className="text-[10px] opacity-80">({counts.tasksCount})</span>
                </button>
              </div>

              {/* View Mode Toggle */}
              <div className="flex rounded-lg bg-muted p-1 text-xs h-8 items-center">
                <button
                  type="button"
                  onClick={() => setViewMode("month")}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    viewMode === "month"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Month
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("week")}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    viewMode === "week"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Week
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("day")}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    viewMode === "day"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Day
                </button>
              </div>
            </div>

            {/* Sub-toolbar: Status, Priority and Clear Filters */}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Filter className="h-3 w-3" /> Status:
                </span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="all">All Status ({counts.total})</option>
                  <option value="pending">Pending / Open ({counts.pending})</option>
                  <option value="completed">Completed ({counts.completed})</option>
                </select>

                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1 flex items-center gap-1">
                  <Flame className="h-3 w-3 text-red-500" /> Priority:
                </span>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="all">All Priorities</option>
                  <option value="high">🔥 High Priority Only ({counts.high})</option>
                </select>

                {hasActiveFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      setTypeFilter("all");
                      setStatusFilter("all");
                      setPriorityFilter("all");
                    }}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground underline ml-2"
                  >
                    <X className="h-3 w-3" /> Clear filters
                  </button>
                )}
              </div>

              {/* Summary count */}
              <div className="text-[11px] text-muted-foreground">
                Showing <strong className="text-foreground">{filteredTasks.length}</strong> of {tasks.length} items
              </div>
            </div>
          </DialogHeader>

          {/* Calendar Grid Container */}
          <div className="flex-1 overflow-y-auto pt-3">
            {/* VIEW MODE 1: MONTH */}
            {viewMode === "month" && (
              <div className="flex flex-col h-full">
                {/* Days Header */}
                <div className="grid grid-cols-7 border-b border-border pb-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {DAYS_HEADER.map((d) => (
                    <div key={d}>{d}</div>
                  ))}
                </div>

                {/* Month Grid */}
                <div className="grid grid-cols-7 auto-rows-[105px] gap-px bg-border/50 border border-border rounded-lg overflow-hidden mt-2">
                  {calendarDays.map((day, idx) => {
                    const isToday = day.fullDateString === todayStr;
                    const dayTasks = tasksByDate[day.fullDateString] || [];

                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          setCurrentDate(new Date(day.fullDateString + "T12:00:00"));
                          if (dayTasks.length > 0) setViewMode("day");
                        }}
                        className={cn(
                          "flex flex-col bg-card p-1.5 transition-colors overflow-hidden group cursor-pointer hover:bg-muted/30",
                          day.isCurrentMonth
                            ? "text-foreground"
                            : "bg-muted/15 text-muted-foreground/40",
                          isToday && "ring-2 ring-inset ring-primary/40 bg-primary/5"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                              isToday ? "bg-primary text-primary-foreground" : ""
                            )}
                          >
                            {day.dateNumber}
                          </span>
                          {dayTasks.length > 0 && (
                            <span className="inline-flex items-center justify-center rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">
                              {dayTasks.length}
                            </span>
                          )}
                        </div>

                        {/* Task badges with rich visuals */}
                        <div className="mt-1 flex-1 overflow-y-auto space-y-1 pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                          {dayTasks.slice(0, 3).map((t) => {
                            const info = getTaskCategoryInfo(t);
                            const Icon = info.icon;
                            const timeStr = formatTaskTime(t.due_date);
                            const isCompleted = t.status === "completed";

                            return (
                              <div
                                key={t.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTaskClick(t);
                                }}
                                title={`${info.label}: ${t.title} ${timeStr ? `at ${timeStr}` : ""} ${t.contact?.name ? `(${t.contact.name})` : ""} - Click to open chat`}
                                className={cn(
                                  "flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium transition-all cursor-pointer shadow-2xs border truncate",
                                  info.color,
                                  t.priority === "high" && "border-l-2 border-l-red-500",
                                  t.priority === "medium" && "border-l-2 border-l-amber-500",
                                  isCompleted && "line-through opacity-55"
                                )}
                              >
                                <Icon className="h-2.5 w-2.5 shrink-0" />
                                {timeStr && (
                                  <span className="font-mono text-[9px] opacity-75 shrink-0">
                                    {timeStr}
                                  </span>
                                )}
                                <span className="truncate flex-1">{t.title}</span>
                              </div>
                            );
                          })}
                          {dayTasks.length > 3 && (
                            <p className="text-[9px] text-muted-foreground font-semibold pl-1">
                              +{dayTasks.length - 3} more...
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* VIEW MODE 2: WEEK */}
            {viewMode === "week" && (
              <div className="flex flex-col h-full">
                {/* 7 Day Columns */}
                <div className="grid grid-cols-7 gap-2 h-full min-h-[460px]">
                  {weekDays.map((wDay) => {
                    const isToday = wDay.fullDateString === todayStr;
                    const dayTasks = tasksByDate[wDay.fullDateString] || [];

                    return (
                      <div
                        key={wDay.fullDateString}
                        className={cn(
                          "flex flex-col rounded-lg border border-border bg-card p-2.5 transition-colors",
                          isToday && "ring-2 ring-primary/40 bg-primary/5"
                        )}
                      >
                        {/* Day Header */}
                        <div className="flex items-center justify-between border-b border-border/70 pb-2 mb-2">
                          <div>
                            <span className="text-[11px] font-bold text-muted-foreground uppercase">
                              {wDay.dayName}
                            </span>
                            <div className="text-base font-bold text-foreground leading-none mt-0.5">
                              {wDay.dateNumber}
                            </div>
                          </div>
                          <span
                            className={cn(
                              "h-5 min-w-5 px-1 flex items-center justify-center rounded-full text-[10px] font-mono",
                              dayTasks.length > 0
                                ? "bg-primary/20 text-primary font-bold"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {dayTasks.length}
                          </span>
                        </div>

                        {/* Day Task List */}
                        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                          {dayTasks.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground italic text-center pt-6">
                              No reminders
                            </p>
                          ) : (
                            dayTasks.map((t) => {
                              const info = getTaskCategoryInfo(t);
                              const Icon = info.icon;
                              const timeStr = formatTaskTime(t.due_date);
                              const isCompleted = t.status === "completed";

                              return (
                                <div
                                  key={t.id}
                                  onClick={() => handleTaskClick(t)}
                                  className={cn(
                                    "flex flex-col gap-1 rounded-md p-2 border transition-all cursor-pointer shadow-xs",
                                    info.color,
                                    t.priority === "high" && "border-l-3 border-l-red-500",
                                    t.priority === "medium" && "border-l-3 border-l-amber-500",
                                    isCompleted && "opacity-55"
                                  )}
                                >
                                  <div className="flex items-center justify-between text-[10px]">
                                    <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider">
                                      <Icon className="h-3 w-3" />
                                      {info.label}
                                    </span>
                                    {timeStr && (
                                      <span className="flex items-center gap-0.5 font-mono text-[9px] opacity-80">
                                        <Clock className="h-2.5 w-2.5" />
                                        {timeStr}
                                      </span>
                                    )}
                                  </div>

                                  <div className="text-xs font-semibold text-foreground line-clamp-2">
                                    {t.title}
                                  </div>

                                  {t.contact && (
                                    <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                                      <User className="h-2.5 w-2.5 shrink-0" />
                                      <span className="truncate">{t.contact.name || t.contact.phone}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* VIEW MODE 3: DAY (Schedule Timeline) */}
            {viewMode === "day" && (
              <div className="flex flex-col h-full max-w-2xl mx-auto py-2">
                <div className="flex items-center justify-between border-b border-border pb-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      Tasks & Reminders for this day
                    </span>
                    <span className="inline-flex items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-xs px-2 py-0.5">
                      {dayTasksList.length}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCreateOpen(true)}
                    className="gap-1 text-xs h-7"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add for this day
                  </Button>
                </div>

                {dayTasksList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground space-y-2">
                    <Clock className="h-10 w-10 opacity-40 text-primary" />
                    <p className="text-sm font-medium">No reminders or tasks scheduled for this date</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCreateOpen(true)}
                      className="mt-2 text-xs"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Create Reminder
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2.5 overflow-y-auto pr-1">
                    {dayTasksList.map((t) => {
                      const info = getTaskCategoryInfo(t);
                      const Icon = info.icon;
                      const timeStr = formatTaskTime(t.due_date);
                      const isCompleted = t.status === "completed";

                      return (
                        <div
                          key={t.id}
                          className={cn(
                            "flex items-start justify-between gap-3 rounded-lg border p-3 transition-all bg-card hover:bg-muted/40",
                            t.priority === "high" && "border-l-4 border-l-red-500",
                            t.priority === "medium" && "border-l-4 border-l-amber-500",
                            isCompleted && "opacity-60"
                          )}
                        >
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <span
                              className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                                info.badgeColor
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </span>

                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={cn("text-xs font-semibold uppercase tracking-wider", info.badgeColor)}>
                                  {info.label}
                                </span>
                                {timeStr && (
                                  <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                    <Clock className="h-3 w-3" />
                                    {timeStr}
                                  </span>
                                )}
                                {t.priority === "high" && (
                                  <span className="inline-flex items-center gap-0.5 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-500 border border-red-500/20">
                                    <Flame className="h-2.5 w-2.5" /> High
                                  </span>
                                )}
                              </div>

                              <h4 className={cn("text-sm font-semibold text-foreground", isCompleted && "line-through")}>
                                {t.title}
                              </h4>

                              {t.description && (
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {t.description}
                                </p>
                              )}

                              {t.contact && (
                                <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground">
                                    {t.contact.name || "Client"}
                                  </span>
                                  <span>•</span>
                                  <span className="font-mono">{t.contact.phone}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <Button
                              size="sm"
                              onClick={() => handleTaskClick(t)}
                              className="gap-1.5 text-xs h-8 bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                              Open Chat
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <CreateReminderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        contact={contact}
        onSaved={() => fetchTasks()}
      />
    </>
  );
}
