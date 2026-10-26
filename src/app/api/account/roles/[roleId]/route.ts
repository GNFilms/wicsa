import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  try {
    const ctx = await requireRole("admin");
    const { roleId } = await params;

    const body = (await request.json().catch(() => null)) as {
      name?: string;
      description?: string;
      color?: string;
      permissions?: Record<string, unknown>;
    } | null;

    if (!body) {
      return NextResponse.json({ error: "Missing update payload" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description?.trim() || null;
    if (body.color !== undefined) updates.color = body.color;
    if (body.permissions !== undefined) updates.permissions = body.permissions;

    const { data, error } = await ctx.supabase
      .from("custom_roles")
      .update(updates)
      .eq("id", roleId)
      .eq("account_id", ctx.accountId)
      .select("*")
      .single();

    if (error) {
      console.error("[PATCH /api/account/roles/[roleId]] error:", error);
      return NextResponse.json({ error: error.message || "Failed to update role" }, { status: 500 });
    }

    return NextResponse.json({ role: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  try {
    const ctx = await requireRole("admin");
    const { roleId } = await params;

    // Remove custom_role_id references from profiles first
    await ctx.supabase
      .from("profiles")
      .update({ custom_role_id: null, custom_role_name: null })
      .eq("custom_role_id", roleId)
      .eq("account_id", ctx.accountId);

    const { error } = await ctx.supabase
      .from("custom_roles")
      .delete()
      .eq("id", roleId)
      .eq("account_id", ctx.accountId);

    if (error) {
      console.error("[DELETE /api/account/roles/[roleId]] error:", error);
      return NextResponse.json({ error: error.message || "Failed to delete role" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
