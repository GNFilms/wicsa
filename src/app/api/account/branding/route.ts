import { NextResponse } from "next/server";
import { getCurrentAccount, requireRole, toErrorResponse } from "@/lib/auth/account";
import type { AccountBranding } from "@/types";

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    const { data, error } = await ctx.supabase
      .from("account_branding")
      .select("*")
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    if (error && error.code !== "42P01") {
      console.error("[GET /api/account/branding] error:", error);
    }

    const branding: AccountBranding = data || {
      account_id: ctx.accountId,
      platform_name: "CRM Template for WhatsApp",
      logo_url: null,
      favicon_url: null,
      primary_color: "#8b5cf6",
      settings: {
        mode: "dark",
        sidebar_theme: "default",
        border_radius: "rounded",
      },
    };

    return NextResponse.json({ branding });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const body = (await request.json().catch(() => null)) as Partial<AccountBranding> | null;

    if (!body) {
      return NextResponse.json({ error: "Missing branding payload" }, { status: 400 });
    }

    const payload = {
      account_id: ctx.accountId,
      platform_name: body.platform_name?.trim() || "CRM Template for WhatsApp",
      logo_url: body.logo_url ?? null,
      favicon_url: body.favicon_url ?? null,
      primary_color: body.primary_color || "#8b5cf6",
      settings: body.settings || {},
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await ctx.supabase
      .from("account_branding")
      .upsert(payload, { onConflict: "account_id" })
      .select("*")
      .single();

    if (error) {
      console.error("[POST /api/account/branding] error:", error);
      return NextResponse.json({ error: error.message || "Failed to save branding" }, { status: 500 });
    }

    return NextResponse.json({ branding: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
