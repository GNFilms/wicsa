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
} from "lucide-react";
import type { Task, Contact } from "@/types";
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
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

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
      const res = await fetch("/api/tasks?limit=100", { cache: "no-store" });
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
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNext = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Build calendar matrix for current month (Monday-start)
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Day of week: 0 is Sun, 1 is Mon... Convert to Mon=0 ... Sun=6
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

    // Fill remaining to complete multiple of 7
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

  const todayStr = new Date().toISOString().split("T")[0];

  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    tasks.forEach((t) => {
      if (t.due_date) {
        const d = t.due_date.split("T")[0];
        if (!map[d]) map[d] = [];
        map[d].push(t);
      }
    });
    return map;
  }, [tasks]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-hidden flex flex-col bg-card text-card-foreground border-border p-6">
          <DialogHeader className="shrink-0 pb-4 border-b border-border">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CalendarIcon className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold">Calendar & Reminders</DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {MONTH_NAMES[month]} {year}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                  className="gap-1.5 shadow-sm bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                  Create Reminder / Task
                </Button>
              </div>
            </div>

            {/* Navigation & View modes toolbar */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon-sm" onClick={handlePrev} title="Previous Month">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={handleToday} className="text-xs font-semibold px-3">
                  Today
                </Button>
                <Button variant="outline" size="icon-sm" onClick={handleNext} title="Next Month">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex rounded-lg bg-muted p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode("month")}
                  className={`rounded-md px-3 py-1 font-medium transition-colors ${
                    viewMode === "month"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Month
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("week")}
                  className={`rounded-md px-3 py-1 font-medium transition-colors ${
                    viewMode === "week"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Week
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("day")}
                  className={`rounded-md px-3 py-1 font-medium transition-colors ${
                    viewMode === "day"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Day
                </button>
              </div>
            </div>
          </DialogHeader>

          {/* Calendar Grid Container */}
          <div className="flex-1 overflow-y-auto pt-3">
            {/* Days Header */}
            <div className="grid grid-cols-7 border-b border-border pb-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {DAYS_HEADER.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7 auto-rows-[96px] gap-px bg-border/50 border border-border rounded-lg overflow-hidden mt-2">
              {calendarDays.map((day, idx) => {
                const isToday = day.fullDateString === todayStr;
                const dayTasks = tasksByDate[day.fullDateString] || [];

                return (
                  <div
                    key={idx}
                    className={`flex flex-col bg-card p-1.5 transition-colors overflow-hidden ${
                      day.isCurrentMonth
                        ? "text-foreground"
                        : "bg-muted/20 text-muted-foreground/40"
                    } ${isToday ? "ring-2 ring-inset ring-primary/40 bg-primary/5" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          isToday
                            ? "bg-primary text-primary-foreground"
                            : ""
                        }`}
                      >
                        {day.dateNumber}
                      </span>
                      {dayTasks.length > 0 && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {dayTasks.length}
                        </span>
                      )}
                    </div>

                    {/* Task badges */}
                    <div className="mt-1 flex-1 overflow-y-auto space-y-1 pr-0.5">
                      {dayTasks.slice(0, 3).map((t) => (
                        <div
                          key={t.id}
                          onClick={() => handleTaskClick(t)}
                          title={`Click to open chat with client for: ${t.title}`}
                          className="truncate rounded bg-primary/20 hover:bg-primary/40 border border-primary/30 px-1.5 py-0.5 text-[10px] font-medium text-foreground cursor-pointer transition-colors shadow-xs"
                        >
                          {t.title}
                        </div>
                      ))}
                      {dayTasks.length > 3 && (
                        <p className="text-[9px] text-muted-foreground font-medium pl-1">
                          +{dayTasks.length - 3} more
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
