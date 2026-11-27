import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';

export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');

    let query = supabase
      .from('scheduled_messages')
      .select('*')
      .eq('account_id', accountId)
      .eq('status', 'pending')
      .order('scheduled_for', { ascending: true });

    if (conversationId) {
      query = query.eq('conversation_id', conversationId);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ scheduled: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await getCurrentAccount();
    const body = await request.json().catch(() => null);

    const conversationId = body?.conversation_id;
    const scheduledFor = body?.scheduled_for;
    const messageType = body?.message_type || 'text';
    const contentText = body?.content_text || null;
    const mediaUrl = body?.media_url || null;
    const templateName = body?.template_name || null;
    const templateLanguage = body?.template_language || null;

    if (!conversationId || !scheduledFor) {
      return NextResponse.json(
        { error: 'conversation_id and scheduled_for are required' },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from('scheduled_messages')
      .insert({
        account_id: accountId,
        conversation_id: conversationId,
        user_id: userId,
        message_type: messageType,
        content_text: contentText,
        media_url: mediaUrl,
        template_name: templateName,
        template_language: templateLanguage,
        scheduled_for: scheduledFor,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, scheduled: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('scheduled_messages')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('account_id', accountId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
