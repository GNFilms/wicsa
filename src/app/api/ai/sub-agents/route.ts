import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';

/**
 * GET /api/ai/sub-agents
 * List all AI sub-agents for the workspace.
 */
export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const { data, error } = await supabase
      .from('ai_sub_agents')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[ai/sub-agents GET] error:', error);
      return NextResponse.json({ error: 'Failed to load sub-agents' }, { status: 500 });
    }
    return NextResponse.json({ sub_agents: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST /api/ai/sub-agents (admin+)
 * Create a new specialized AI sub-agent.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const body = await request.json().catch(() => null);

    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const role = typeof body?.role === 'string' ? body.role.trim() : 'assistant';
    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    const trigger_type = typeof body?.trigger_type === 'string' ? body.trigger_type : 'all';
    const trigger_keywords = Array.isArray(body?.trigger_keywords) ? body.trigger_keywords : [];
    const model = typeof body?.model === 'string' ? body.model : 'gpt-4o-mini';
    const is_active = typeof body?.is_active === 'boolean' ? body.is_active : true;

    if (!name || !prompt) {
      return NextResponse.json({ error: 'name and prompt are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('ai_sub_agents')
      .insert({
        account_id: accountId,
        name,
        role,
        description,
        prompt,
        trigger_type,
        trigger_keywords,
        model,
        is_active,
      })
      .select()
      .single();

    if (error) {
      console.error('[ai/sub-agents POST] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sub_agent: data }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * PUT /api/ai/sub-agents (admin+)
 * Update an existing sub-agent (or toggle is_active).
 */
export async function PUT(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const body = await request.json().catch(() => null);

    const id = body?.id;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof body.name === 'string') patch.name = body.name.trim();
    if (typeof body.role === 'string') patch.role = body.role.trim();
    if (typeof body.description === 'string') patch.description = body.description.trim();
    if (typeof body.prompt === 'string') patch.prompt = body.prompt.trim();
    if (typeof body.trigger_type === 'string') patch.trigger_type = body.trigger_type;
    if (Array.isArray(body.trigger_keywords)) patch.trigger_keywords = body.trigger_keywords;
    if (typeof body.model === 'string') patch.model = body.model;
    if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;

    const { data, error } = await supabase
      .from('ai_sub_agents')
      .update(patch)
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      console.error('[ai/sub-agents PUT] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sub_agent: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * DELETE /api/ai/sub-agents (admin+)
 * Delete a sub-agent.
 */
export async function DELETE(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id parameter is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('ai_sub_agents')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId);

    if (error) {
      console.error('[ai/sub-agents DELETE] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
