// ============================================================
// /api/account/members
//
// GET  — Lists every member of the caller's account.
// POST — Creates a new member (admin+): sign-up via Supabase Admin
//        auth, link the profile to the caller's account, and
//        optionally assign a pipeline stage + label.
//
// Field visibility (GET)
//   Sensitive fields (email) are returned only when the caller is
//   admin+. Agents and viewers see name + avatar + role + joined
//   date only. This mirrors the design decision from the planning
//   phase: "agent/viewer sees names only".
// ============================================================

import { NextResponse } from "next/server";
import { createClient as createAdminSupabase } from "@supabase/supabase-js";

import { getCurrentAccount, requireRole, toErrorResponse } from "@/lib/auth/account";
import { canManageMembers, isAccountRole } from "@/lib/auth/roles";
import type { AccountMember } from "@/types";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

interface ProfileRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  account_role: string;
  custom_role_id?: string | null;
  custom_role_name?: string | null;
  pipeline_id?: string | null;
  pipeline_name?: string | null;
  stage_id?: string | null;
  stage_name?: string | null;
  label?: string | null;
  created_at: string;
}

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    // RLS on profiles allows reading any row whose account matches
    // the caller's, so this query is naturally account-scoped.
    // Try selecting with custom_role and assignment columns, with graceful fallbacks
    let data: ProfileRow[] | null = null;
    const resWithAll = await ctx.supabase
      .from("profiles")
      .select(
        "user_id, full_name, email, avatar_url, account_role, custom_role_id, custom_role_name, pipeline_id, pipeline_name, stage_id, stage_name, label, created_at"
      )
      .eq("account_id", ctx.accountId)
      .order("created_at", { ascending: true });

    if (resWithAll.error) {
      // Fallback if migration 044 hasn't run yet
      const resWithCustom = await ctx.supabase
        .from("profiles")
        .select(
          "user_id, full_name, email, avatar_url, account_role, custom_role_id, custom_role_name, created_at"
        )
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
    } else {
      data = resWithAll.data as ProfileRow[];
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
          pipeline_id: row.pipeline_id || null,
          pipeline_name: row.pipeline_name || null,
          stage_id: row.stage_id || null,
          stage_name: row.stage_name || null,
          label: row.label || null,
          joined_at: row.created_at,
        },
      ];
    });

    return NextResponse.json({ members });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");

    const limit = checkRateLimit(
      `admin:memberCreate:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      email?: unknown;
      password?: unknown;
      role?: unknown;
      custom_role_id?: string | null;
      custom_role_name?: string | null;
      pipeline_id?: string | null;
      pipeline_name?: string | null;
      stage_id?: string | null;
      stage_name?: string | null;
      label?: string | null;
    } | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const trimmedName = typeof body.name === "string" ? body.name.trim() : "";
    const trimmedEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const trimmedPassword = typeof body.password === "string" ? body.password : "";

    if (!trimmedName) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
    }
    if (!trimmedPassword || trimmedPassword.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 },
      );
    }

    const rawRole = typeof body.role === "string" ? body.role : "agent";
    const isCustom = rawRole.startsWith("custom:");
    const customRoleId = isCustom
      ? rawRole.replace("custom:", "")
      : body.custom_role_id || null;
    const baseRole = isCustom ? "agent" : rawRole;

    if (!isAccountRole(baseRole) || baseRole === "owner") {
      return NextResponse.json(
        { error: "Role must be one of admin, agent, viewer" },
        { status: 400 },
      );
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceKey || !supabaseUrl) {
      return NextResponse.json(
        { error: "Server configuration missing service credentials" },
        { status: 500 },
      );
    }

    const adminSupabase = createAdminSupabase(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Create user in Supabase Auth directly
    const { data: authData, error: createAuthError } =
      await adminSupabase.auth.admin.createUser({
        email: trimmedEmail,
        password: trimmedPassword,
        email_confirm: true,
        user_metadata: {
          full_name: trimmedName,
        },
      });

    if (createAuthError || !authData?.user) {
      console.error("[POST /api/account/members] createUser error:", createAuthError);
      return NextResponse.json(
        { error: createAuthError?.message || "Failed to create user" },
        { status: 400 },
      );
    }

    const newUserId = authData.user.id;

    // 2. The handle_new_user trigger creates an orphan personal account for new user. Clean it up.
    await adminSupabase
      .from("accounts")
      .delete()
      .eq("owner_user_id", newUserId)
      .neq("id", ctx.accountId);

    // 3. Upsert / update user profile linked to current account
    const profilePayload: Record<string, unknown> = {
      user_id: newUserId,
      full_name: trimmedName,
      email: trimmedEmail,
      account_id: ctx.accountId,
      account_role: baseRole,
      custom_role_id: customRoleId,
      custom_role_name: body.custom_role_name || null,
      pipeline_id: body.pipeline_id || null,
      pipeline_name: body.pipeline_name || null,
      stage_id: body.stage_id || null,
      stage_name: body.stage_name || null,
      label: typeof body.label === "string" && body.label.trim() ? body.label.trim() : null,
      updated_at: new Date().toISOString(),
    };

    let upsertRes = await adminSupabase
      .from("profiles")
      .upsert(profilePayload, { onConflict: "user_id" });

    if (upsertRes.error) {
      console.warn(
        "[POST /api/account/members] profile upsert with assignment fields failed, falling back:",
        upsertRes.error,
      );
      const fallbackPayload = {
        user_id: newUserId,
        full_name: trimmedName,
        email: trimmedEmail,
        account_id: ctx.accountId,
        account_role: baseRole,
        custom_role_id: customRoleId,
        custom_role_name: body.custom_role_name || null,
        updated_at: new Date().toISOString(),
      };
      const fallbackRes = await adminSupabase
        .from("profiles")
        .upsert(fallbackPayload, { onConflict: "user_id" });

      if (fallbackRes.error) {
        console.error(
          "[POST /api/account/members] fallback profile upsert error:",
          fallbackRes.error,
        );
        return NextResponse.json(
          { error: "User was registered, but failed to link profile to account" },
          { status: 500 },
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        member: {
          user_id: newUserId,
          full_name: trimmedName,
          email: trimmedEmail,
          role: baseRole,
          custom_role_id: customRoleId,
          custom_role_name: body.custom_role_name || null,
          pipeline_id: body.pipeline_id || null,
          pipeline_name: body.pipeline_name || null,
          stage_id: body.stage_id || null,
          stage_name: body.stage_name || null,
          label: typeof body.label === "string" && body.label.trim() ? body.label.trim() : null,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
