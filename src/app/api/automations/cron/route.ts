import { NextResponse } from 'next/server'
import { drainDuePendingExecutions } from '@/lib/automations/engine'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { sendMessageToConversation } from '@/lib/whatsapp/send-message'

async function drainDueScheduledMessages(): Promise<number> {
  try {
    const admin = supabaseAdmin()
    const nowIso = new Date().toISOString()
    const { data: due } = await admin
      .from('scheduled_messages')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', nowIso)
      .order('scheduled_for', { ascending: true })
      .limit(25)

    let sent = 0
    for (const item of due ?? []) {
      try {
        await sendMessageToConversation(admin, item.account_id, {
          conversationId: item.conversation_id,
          messageType: item.message_type,
          contentText: item.content_text ?? undefined,
          mediaUrl: item.media_url ?? undefined,
          templateName: item.template_name ?? undefined,
          templateLanguage: item.template_language ?? undefined,
        })
        await admin.from('scheduled_messages').update({ status: 'sent' }).eq('id', item.id)
        sent++
      } catch (err) {
        await admin
          .from('scheduled_messages')
          .update({
            status: 'failed',
            error_message: err instanceof Error ? err.message : 'Send failed',
          })
          .eq('id', item.id)
      }
    }
    return sent
  } catch {
    return 0
  }
}

declare const process: any

export const dynamic = 'force-dynamic'

function isAuthorized(request: Request): boolean {
  const expectedSecret = process.env.AUTOMATION_CRON_SECRET || process.env.CRON_SECRET
  if (!expectedSecret) {
    // If no secret is configured, allow the call so cron pingers / internal drains work without setup
    return true
  }

  const suppliedX = request.headers.get('x-cron-secret')
  if (suppliedX && suppliedX === expectedSecret) return true

  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    if (token === expectedSecret) return true
  }

  return false
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [processed, scheduledSent] = await Promise.all([
    drainDuePendingExecutions(),
    drainDueScheduledMessages(),
  ])
  return NextResponse.json({ ok: true, processed, scheduledSent })
}

export async function POST(request: Request) {
  return GET(request)
}
