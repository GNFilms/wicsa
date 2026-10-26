// ============================================================
// GET /api/account/members
//
// Lists every member of the caller's account. Any member can call
// it (the Members tab is shown to admins+, but agents/viewers see
// a read-only roster too).
//
// Field visibility
//   Sensitive fields (email) are returned only when the caller is
//   admin+. Agents and viewers see name + avatar + role + joined
//   date only. This mirrors the design decision from the planning
//   phase: "agent/viewer sees names only".
// ============================================================

import { NextResponse } from "next/server";

import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";
import { canManageMembers, isAccountRole } from "@/lib/auth/roles";
import type { AccountMember } from "@/types";

interface ProfileRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  account_role: string;
  custom_role_id?: string | null;
  custom_role_name?: string | null;
  created_at: string;
}

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    // RLS on profiles allows reading any row whose account matches
    // the caller's, so this query is naturally account-scoped.
    // Try selecting with custom_role columns, fallback if not migrated yet
    let data: ProfileRow[] | null = null;
    const resWithCustom = await ctx.supabase
      .from("profiles")
      .select("user_id, full_name, email, avatar_url, account_role, custom_role_id, custom_role_name, created_at")
      .eq("account_id", ctx.accountId)
      .order("created_at", { ascending: true });

    if (resWithCustom.error) {
      // Fallback in case migration 043 hasn't run yet
      const fallback = await ctx.supabase
        .from("profiles")
        .select("user_id, full_name, email, avatar_url, account_role, created_at")
        .eq("account_id", ctx.accountId)
        .order("created_at", { ascending: true });
      if (fallback.error) {
        console.error("[GET /api/account/members] fetch error:", fallback.error);
        return NextResponse.json({ error: "Failed to load members" }, { status: 500 });
      }
      data = fallback.data as ProfileRow[];
    } else {
      data = resWithCustom.data as ProfileRow[];
    }

    const canSeeEmails = canManageMembers(ctx.role);

    const members: AccountMember[] = (data ?? []).flatMap((row) => {
      if (!isAccountRole(row.account_role)) return [];
      return [
        {
          user_id: row.user_id,
          full_name: row.full_name ?? "",
          email: canSeeEmails ? row.email : null,
          avatar_url: row.avatar_url,
          role: row.account_role,
          custom_role_id: row.custom_role_id || null,
          custom_role_name: row.custom_role_name || null,
          joined_at: row.created_at,
        },
      ];
    });

    return NextResponse.json({ members });
  } catch (err) {
    return toErrorResponse(err);
  }
}
