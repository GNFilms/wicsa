import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { dispatchAutomationDirectly } from '@/lib/automations/engine'

/**
 * POST /api/automations/trigger
 * Body: { automationId: string, contactId: string, conversationId?: string }
 *
 * Manually starts an active automation for a contact directly from the inbox.
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
  if (!body?.automationId || !body?.contactId) {
    return NextResponse.json({ error: 'automationId and contactId are required' }, { status: 400 })
  }

  try {
    const res = await dispatchAutomationDirectly(supabaseAdmin(), {
      automationId: body.automationId,
      accountId,
      contactId: body.contactId,
      conversationId: body.conversationId,
    })

    return NextResponse.json({ ok: true, result: res })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to trigger automation' },
      { status: 400 }
    )
  }
}

