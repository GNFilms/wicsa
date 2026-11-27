import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { sendMessageToConversation } from '@/lib/whatsapp/send-message';

export const dynamic = 'force-dynamic';

/**
 * GET /api/messages/schedule/cron
 * Processes all pending scheduled_messages whose scheduled_for <= now().
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admin = supabaseAdmin();
    const nowIso = new Date().toISOString();

    const { data: due, error } = await admin
      .from('scheduled_messages')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', nowIso)
      .order('scheduled_for', { ascending: true })
      .limit(25);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let sent = 0;
    let failed = 0;

    for (const item of due ?? []) {
      try {
        await sendMessageToConversation({
          supabase: admin,
          accountId: item.account_id,
          conversationId: item.conversation_id,
          messageType: item.message_type,
          contentText: item.content_text ?? undefined,
          mediaUrl: item.media_url ?? undefined,
          templateName: item.template_name ?? undefined,
          templateLanguage: item.template_language ?? undefined,
        });

        await admin
          .from('scheduled_messages')
          .update({ status: 'sent' })
          .eq('id', item.id);
        sent++;
      } catch (err) {
        await admin
          .from('scheduled_messages')
          .update({
            status: 'failed',
            error_message: err instanceof Error ? err.message : 'Send failed',
          })
          .eq('id', item.id);
        failed++;
      }
    }

    return NextResponse.json({ success: true, processed: (due ?? []).length, sent, failed });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cron failed' },
      { status: 500 },
    );
  }
}
