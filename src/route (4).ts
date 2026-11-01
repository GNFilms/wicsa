import { NextResponse } from "next/server";
import { getCurrentAccount, requireRole, toErrorResponse } from "@/lib/auth/account";
import type { CustomRole } from "@/types";

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    const { data, error } = await ctx.supabase
      .from("custom_roles")
      .select("*")
      .eq("account_id", ctx.accountId)
      .order("created_at", { ascending: true });

    if (error) {
      // If table does not exist yet (prior to migration), return empty list gracefully
      if (error.code === "42P01") {
        return NextResponse.json({ roles: [] });
      }
      console.error("[GET /api/account/roles] fetch error:", error);
      return NextResponse.json({ error: "Failed to load roles" }, { status: 500 });
    }

    return NextResponse.json({ roles: (data ?? []) as CustomRole[] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const body = (await request.json().catch(() => null)) as {
      name?: string;
      description?: string;
      color?: string;
      permissions?: Record<string, unknown>;
    } | null;

    if (!body?.name?.trim()) {
      return NextResponse.json({ error: "Role name is required" }, { status: 400 });
    }

    const newRole = {
      account_id: ctx.accountId,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      color: body.color || "#8b5cf6",
      permissions: body.permissions || {
        view_all_conversations: false,
        only_assigned_conversations: true,
        assigned_tag_ids: [],
        can_view_contacts: true,
        can_edit_contacts: true,
        can_send_messages: true,
        can_access_pipelines: true,
        can_access_broadcasts: false,
        can_access_automations: false,
        can_access_flows: false,
        can_access_ai_agents: false,
        can_access_settings: false,
      },
    };

    const { data, error } = await ctx.supabase
      .from("custom_roles")
      .insert(newRole)
      .select("*")
      .single();

    if (error) {
      console.error("[POST /api/account/roles] insert error:", error);
      return NextResponse.json({ error: error.message || "Failed to create role" }, { status: 500 });
    }

    return NextResponse.json({ role: data }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
