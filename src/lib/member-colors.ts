/**
 * Distinctive, visually accessible colors for team members across
 * pipelines, board headers, assignee filters, and deal cards.
 */

export interface MemberColor {
  bg: string;
  text: string;
  border: string;
  dot: string;
  hex: string;
}

export const MEMBER_COLORS: MemberColor[] = [
  {
    bg: "bg-purple-500/15",
    text: "text-purple-600 dark:text-purple-400",
    border: "border-purple-500/30",
    dot: "bg-purple-500",
    hex: "#a855f7",
  },
  {
    bg: "bg-blue-500/15",
    text: "text-blue-600 dark:text-blue-400",
    border: "border-blue-500/30",
    dot: "bg-blue-500",
    hex: "#3b82f6",
  },
  {
    bg: "bg-emerald-500/15",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/30",
    dot: "bg-emerald-500",
    hex: "#10b981",
  },
  {
    bg: "bg-amber-500/15",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/30",
    dot: "bg-amber-500",
    hex: "#f59e0b",
  },
  {
    bg: "bg-rose-500/15",
    text: "text-rose-600 dark:text-rose-400",
    border: "border-rose-500/30",
    dot: "bg-rose-500",
    hex: "#f43f5e",
  },
  {
    bg: "bg-cyan-500/15",
    text: "text-cyan-600 dark:text-cyan-400",
    border: "border-cyan-500/30",
    dot: "bg-cyan-500",
    hex: "#06b6d4",
  },
  {
    bg: "bg-indigo-500/15",
    text: "text-indigo-600 dark:text-indigo-400",
    border: "border-indigo-500/30",
    dot: "bg-indigo-500",
    hex: "#6366f1",
  },
  {
    bg: "bg-orange-500/15",
    text: "text-orange-600 dark:text-orange-400",
    border: "border-orange-500/30",
    dot: "bg-orange-500",
    hex: "#f97316",
  },
  {
    bg: "bg-teal-500/15",
    text: "text-teal-600 dark:text-teal-400",
    border: "border-teal-500/30",
    dot: "bg-teal-500",
    hex: "#14b8a6",
  },
  {
    bg: "bg-pink-500/15",
    text: "text-pink-600 dark:text-pink-400",
    border: "border-pink-500/30",
    dot: "bg-pink-500",
    hex: "#ec4899",
  },
];

export function getMemberColor(key?: string | null): MemberColor {
  if (!key) {
    return {
      bg: "bg-muted",
      text: "text-muted-foreground",
      border: "border-border",
      dot: "bg-muted-foreground",
      hex: "#94a3b8",
    };
  }

  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % MEMBER_COLORS.length;
  return MEMBER_COLORS[index];
}
