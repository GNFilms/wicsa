import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send-message';

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
      .select('*, conversations(contact_id, contacts(phone))')
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
      const phone = (item as any).conversations?.contacts?.phone;
      if (!phone) {
        await admin
          .from('scheduled_messages')
          .update({ status: 'failed', error_message: 'Missing recipient phone' })
          .eq('id', item.id);
        failed++;
        continue;
      }

      try {
        const result = await sendWhatsAppMessage({
          accountId: item.account_id,
          to: phone,
          type: item.message_type,
          text: item.content_text ?? undefined,
          mediaUrl: item.media_url ?? undefined,
          templateName: item.template_name ?? undefined,
          templateLanguage: item.template_language ?? undefined,
        });

        await admin.from('messages').insert({
          conversation_id: item.conversation_id,
          sender_type: 'agent',
          content_type: item.message_type,
          content_text: item.content_text ?? (item.template_name ? `Template: ${item.template_name}` : ''),
          media_url: item.media_url,
          template_name: item.template_name,
          message_id: result.messageId ?? null,
          status: 'sent',
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
