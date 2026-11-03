import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { startFlowDirectly } from '@/lib/flows/engine'

/**
 * POST /api/flows/trigger
 * Body: { flowId: string, contactId: string, conversationId?: string }
 *
 * Manually starts a published/active flow for a contact directly from the inbox.
 */
export async function POST(request: Request) {
  let accountId: string
  try {
    const ctx = await requireRole('agent')
    accountId = ctx.accountId
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body?.flowId || !body?.contactId) {
    return NextResponse.json({ error: 'flowId and contactId are required' }, { status: 400 })
  }

  const res = await startFlowDirectly(supabaseAdmin(), {
    flowId: body.flowId,
    accountId,
    contactId: body.contactId,
    conversationId: body.conversationId,
    origin: 'manual_inbox',
  })

  if (!res.success) {
    return NextResponse.json({ error: res.error || 'Failed to start flow' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, flowRunId: res.flowRunId })
}

