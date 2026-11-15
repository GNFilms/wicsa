// ============================================================
// /api/account/members/[userId]
//
//   PATCH  — change a member's role (system or custom) or assignments. Admin+.
//   DELETE — remove a member (reassign to personal account or delete user). Admin+.
//
// Uses service-role client (getAdminClient) to bypass profile_update RLS
// (which only permits a user to update their own profile), ensuring
// custom roles, system roles, and removals are reliably applied.
// ============================================================

import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { isAccountRole } from "@/lib/auth/roles";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const ctx = await requireRole("admin");

    const limit = checkRateLimit(
      `admin:memberRole:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { userId } = await params;

    const body = (await request.json().catch(() => null)) as {
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

    const adminClient = getAdminClient();

    // 1. Verify target user is in caller's account and not the owner
    const { data: targetProfile, error: targetError } = await adminClient
      .from("profiles")
      .select("user_id, account_id, account_role")
      .eq("user_id", userId)
      .single();

    if (targetError || !targetProfile) {
      return NextResponse.json({ error: "Target member not found" }, { status: 404 });
    }

    if (targetProfile.account_id !== ctx.accountId) {
      return NextResponse.json(
        { error: "Target user is not a member of your account" },
        { status: 403 },
      );
    }

    if (targetProfile.account_role === "owner") {
      return NextResponse.json(
        { error: "Cannot modify the account owner. Use transfer ownership instead." },
        { status: 400 },
      );
    }

    if (userId === ctx.userId) {
      return NextResponse.json(
        { error: "Cannot change your own role here" },
        { status: 400 },
      );
    }

    // 2. Build profile updates
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.role !== undefined) {
      if (!isAccountRole(body.role)) {
        return NextResponse.json(
          { error: "'role' must be one of admin, agent, viewer" },
          { status: 400 },
        );
      }
      if (body.role === "owner") {
        return NextResponse.json(
          { error: "Use transfer ownership to promote a member to owner" },
          { status: 400 },
        );
      }
      updates.account_role = body.role;
    }

    if (body.custom_role_id !== undefined) {
      updates.custom_role_id = body.custom_role_id;
    }
    if (body.custom_role_name !== undefined) {
      updates.custom_role_name = body.custom_role_name;
    }
    if (body.pipeline_id !== undefined) {
      updates.pipeline_id = body.pipeline_id;
    }
    if (body.pipeline_name !== undefined) {
      updates.pipeline_name = body.pipeline_name;
    }
    if (body.stage_id !== undefined) {
      updates.stage_id = body.stage_id;
    }
    if (body.stage_name !== undefined) {
      updates.stage_name = body.stage_name;
    }
    if (body.label !== undefined) {
      updates.label = body.label;
    }

    // 3. Execute update via service-role to bypass self-only profiles_update RLS
    let { error: updateError } = await adminClient
      .from("profiles")
      .update(updates)
      .eq("user_id", userId)
      .eq("account_id", ctx.accountId);

    if (updateError) {
      console.warn(
        "[PATCH /api/account/members/[userId]] update with full columns failed, falling back to core fields:",
        updateError,
      );
      // Graceful fallback if newer columns don't exist yet
      const fallbackUpdates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (updates.account_role) fallbackUpdates.account_role = updates.account_role;
      if (updates.custom_role_id !== undefined) fallbackUpdates.custom_role_id = updates.custom_role_id;
      if (updates.custom_role_name !== undefined) fallbackUpdates.custom_role_name = updates.custom_role_name;

      const fallbackRes = await adminClient
        .from("profiles")
        .update(fallbackUpdates)
        .eq("user_id", userId)
        .eq("account_id", ctx.accountId);

      if (fallbackRes.error) {
        console.error("[PATCH /api/account/members/[userId]] fallback update failed:", fallbackRes.error);
        return NextResponse.json(
          { error: fallbackRes.error.message || "Failed to update member role" },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const ctx = await requireRole("admin");

    const limit = checkRateLimit(
      `admin:memberRemove:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { userId } = await params;
    const adminClient = getAdminClient();

    // 1. Verify target user
    const { data: targetProfile, error: targetError } = await adminClient
      .from("profiles")
      .select("user_id, account_id, account_role, full_name, email")
      .eq("user_id", userId)
      .single();

    if (targetError || !targetProfile) {
      return NextResponse.json({ error: "Target member not found" }, { status: 404 });
    }

    if (targetProfile.account_id !== ctx.accountId) {
      return NextResponse.json(
        { error: "Target user is not a member of your account" },
        { status: 403 },
      );
    }

    if (targetProfile.account_role === "owner") {
      return NextResponse.json(
        { error: "Cannot remove the account owner; transfer ownership first" },
        { status: 400 },
      );
    }

    if (userId === ctx.userId) {
      return NextResponse.json(
        { error: "Cannot remove yourself from the account" },
        { status: 400 },
      );
    }

    // Check optional deleteUser flag from query string or body
    const url = new URL(request.url);
    const deleteAuthUser = url.searchParams.get("deleteUser") === "true";

    if (deleteAuthUser) {
      // 1. Clean up presence
      await adminClient.from("member_presence").delete().eq("user_id", userId);
      // 2. Unassign from deals & pipeline stages
      const { data: userProfile } = await adminClient
        .from("profiles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (userProfile?.id) {
        await adminClient.from("deals").update({ assigned_to: null }).eq("assigned_to", userProfile.id);
        await adminClient.from("pipeline_stages").update({ default_assignee_id: null }).eq("default_assignee_id", userProfile.id);
      }
      await adminClient.from("conversations").update({ assigned_agent_id: null }).eq("assigned_agent_id", userId);

      // 3. Clean up personal accounts owned by this user
      await adminClient.from("accounts").delete().eq("owner_user_id", userId);

      // 4. Clean up profiles
      await adminClient.from("profiles").delete().eq("user_id", userId);

      // 5. Delete user from auth
      const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId);
      if (deleteAuthError) {
        console.error("[DELETE /api/account/members/[userId]] auth delete error:", deleteAuthError);
        return NextResponse.json(
          { error: deleteAuthError.message || "Database error deleting user from auth" },
          { status: 500 },
        );
      }
      return NextResponse.json({ ok: true, deleted: true });
    }

    // Standard remove: relocate to personal account
    // 2. Check if the user already has a personal account where they are the owner
    const { data: existingAccount } = await adminClient
      .from("accounts")
      .select("id")
      .eq("owner_user_id", userId)
      .maybeSingle();

    let personalAccountId = existingAccount?.id;

    if (!personalAccountId) {
      const personalAccountName =
        targetProfile.full_name?.trim() ||
        targetProfile.email ||
        "Personal Account";

      const { data: newAccount, error: createAccountError } = await adminClient
        .from("accounts")
        .insert({
          name: personalAccountName,
          owner_user_id: userId,
        })
        .select("id")
        .single();

      if (createAccountError || !newAccount) {
        console.error(
          "[DELETE /api/account/members/[userId]] create personal account error:",
          createAccountError,
        );
        return NextResponse.json(
          { error: createAccountError?.message || "Failed to create personal account for removed member" },
          { status: 500 },
        );
      }
      personalAccountId = newAccount.id;
    }

    // 3. Reassign profile to their personal account and clear old account's pipeline/stage/custom role
    const { error: reassignError } = await adminClient
      .from("profiles")
      .update({
        account_id: personalAccountId,
        account_role: "owner",
        custom_role_id: null,
        custom_role_name: null,
        pipeline_id: null,
        pipeline_name: null,
        stage_id: null,
        stage_name: null,
        label: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (reassignError) {
      console.error(
        "[DELETE /api/account/members/[userId]] reassign profile error:",
        reassignError,
      );
      return NextResponse.json(
        { error: reassignError.message || "Failed to remove member from account" },
        { status: 500 },
      );
    }

    // 4. Remove active presence record in current account
    await adminClient.from("member_presence").delete().eq("user_id", userId);

    return NextResponse.json({ ok: true, newPersonalAccountId: personalAccountId });
  } catch (err) {
    return toErrorResponse(err);
  }
}
