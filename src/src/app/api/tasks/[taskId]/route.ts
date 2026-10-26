import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const ctx = await requireRole("agent");
    const { taskId } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

    if (!body) {
      return NextResponse.json({ error: "Missing payload" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      ...body,
      updated_at: new Date().toISOString(),
    };
    delete updates.id;
    delete updates.account_id;

    const { data, error } = await ctx.supabase
      .from("tasks")
      .update(updates)
      .eq("id", taskId)
      .eq("account_id", ctx.accountId)
      .select("*, contact:contacts(*)")
      .single();

    if (error) {
      console.error("[PATCH /api/tasks/[taskId]] error:", error);
      return NextResponse.json({ error: error.message || "Failed to update task" }, { status: 500 });
    }

    return NextResponse.json({ task: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const ctx = await requireRole("agent");
    const { taskId } = await params;

    const { error } = await ctx.supabase
      .from("tasks")
      .delete()
      .eq("id", taskId)
      .eq("account_id", ctx.accountId);

    if (error) {
      console.error("[DELETE /api/tasks/[taskId]] error:", error);
      return NextResponse.json({ error: error.message || "Failed to delete task" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
