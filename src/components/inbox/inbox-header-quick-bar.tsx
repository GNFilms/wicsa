"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task } from "@/types";
import { CreateReminderDialog } from "@/components/reminders/create-reminder-dialog";
import { ReminderCalendarModal } from "@/components/reminders/reminder-calendar-modal";

export function InboxHeaderQuickBar() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "30min" | "3hours" | "today">("all");

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks?limit=30", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json.tasks) {
          setTasks(json.tasks.filter((t: Task) => t.status !== "completed"));
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 30000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  const now = Date.now();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const endOfTodayTime = endOfToday.getTime();

  const next30MinTasks = tasks.filter((t) => {
    if (!t.due_date) return false;
    const due = new Date(t.due_date).getTime();
    return due <= now + 30 * 60 * 1000;
  });

  const next3HoursTasks = tasks.filter((t) => {
    if (!t.due_date) return false;
    const due = new Date(t.due_date).getTime();
    return due <= now + 3 * 60 * 60 * 1000;
  });

  const todayTasks = tasks.filter((t) => {
    if (!t.due_date) return false;
    const due = new Date(t.due_date).getTime();
    return due <= endOfTodayTime;
  });

  const activeTasks =
    filter === "30min"
      ? next30MinTasks
      : filter === "3hours"
      ? next3HoursTasks
      : filter === "today"
      ? todayTasks
      : tasks;

  const handleTaskClick = (task: Task) => {
    const conversationId = task.conversation_id || null;
    const contactId = task.contact_id || task.contact?.id || null;
    const phone = task.contact?.phone || null;

    // 1. Dispatch custom event for immediate zero-latency in-memory switch in InboxPage
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

    // 2. Also update query params so if navigated or refreshed, the thread remains active
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

  return (
    <>
      <div className="flex flex-1 items-center gap-1.5 sm:gap-2 px-1 sm:px-3 overflow-x-auto scrollbar-none min-w-0">
        {/* Reminder & Task Calendar button */}
        <button
          type="button"
          onClick={() => setCalendarOpen(true)}
          className="flex items-center gap-1.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary px-2.5 sm:px-3 py-1 text-xs font-semibold transition-colors shrink-0 shadow-2xs cursor-pointer border border-primary/20"
          title="Open Reminder & Task Calendar"
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="whitespace-nowrap">Reminder & Task</span>
          {tasks.length > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground font-bold leading-none">
              {tasks.length}
            </span>
          )}
        </button>

        {/* 3 Sorting Buttons: [ 30 ] [ 3H ] [ T ] */}
        <div className="flex items-center gap-1 shrink-0 bg-muted/60 p-0.5 rounded-full border border-border/60">
          <button
            type="button"
            onClick={() => setFilter(filter === "30min" ? "all" : "30min")}
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition-all cursor-pointer",
              filter === "30min"
                ? "bg-red-500 text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            title="Tasks in Next 30 Minutes"
          >
            <span>30</span>
            {next30MinTasks.length > 0 && (
              <span
                className={cn(
                  "flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none",
                  filter === "30min" ? "bg-white text-red-600" : "bg-red-500/15 text-red-500"
                )}
              >
                {next30MinTasks.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setFilter(filter === "3hours" ? "all" : "3hours")}
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition-all cursor-pointer",
              filter === "3hours"
                ? "bg-amber-500 text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            title="Tasks in Next 3 Hours"
          >
            <span>3H</span>
            {next3HoursTasks.length > 0 && (
              <span
                className={cn(
                  "flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none",
                  filter === "3hours" ? "bg-white text-amber-700" : "bg-amber-500/15 text-amber-600"
                )}
              >
                {next3HoursTasks.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setFilter(filter === "today" ? "all" : "today")}
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition-all cursor-pointer",
              filter === "today"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            title="Tasks due Today"
          >
            <span>T</span>
            {todayTasks.length > 0 && (
              <span
                className={cn(
                  "flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none",
                  filter === "today" ? "bg-white text-primary" : "bg-primary/15 text-primary"
                )}
              >
                {todayTasks.length}
              </span>
            )}
          </button>
        </div>

        {/* Reminder Pills - Click to open chat */}
        <div className="hidden md:flex items-center gap-1.5 overflow-hidden text-xs flex-1 min-w-0">
          {activeTasks.slice(0, 3).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTaskClick(t)}
              className="group flex items-center gap-1.5 rounded-full border border-border/80 bg-background/80 hover:bg-primary/10 hover:border-primary/50 px-2.5 py-0.5 transition-all text-xs max-w-[220px] truncate shadow-2xs cursor-pointer shrink-0"
              title={`Click to open chat with client for: ${t.title}`}
            >
              <Bell className="h-3 w-3 text-primary shrink-0 group-hover:scale-110 transition-transform" />
              <span className="font-medium text-foreground truncate">{t.title}</span>
              {t.contact?.phone && (
                <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                  ({t.contact.phone.slice(-4)})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Create new reminder button */}
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex h-7 w-7 items-center justify-center rounded-full text-primary hover:bg-primary/10 transition-colors shrink-0"
          title="Create New Reminder / Task"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <CreateReminderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={fetchTasks}
      />

      <ReminderCalendarModal
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
      />
    </>
  );
}
