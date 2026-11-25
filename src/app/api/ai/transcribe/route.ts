import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { decrypt } from '@/lib/whatsapp/encryption';

/**
 * POST /api/ai/transcribe
 * Transcribes an audio/voice-note message using the account's OpenAI Whisper key
 * and saves the transcript to `messages.content_text`.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const body = await request.json().catch(() => null);
    const messageId = typeof body?.messageId === 'string' ? body.messageId.trim() : '';
    const mediaUrl = typeof body?.mediaUrl === 'string' ? body.mediaUrl.trim() : '';

    if (!mediaUrl) {
      return NextResponse.json({ error: 'mediaUrl is required' }, { status: 400 });
    }

    // Fetch OpenAI key from ai_configs
    const { data: cfg } = await supabase
      .from('ai_configs')
      .select('provider, api_key, embeddings_api_key')
      .eq('account_id', accountId)
      .maybeSingle();

    let openAiKey = '';
    if (cfg?.provider === 'openai' && cfg.api_key) {
      openAiKey = decrypt(cfg.api_key);
    } else if (cfg?.embeddings_api_key) {
      openAiKey = decrypt(cfg.embeddings_api_key);
    }

    if (!openAiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key is not configured. Add it in AI Agents → Setup.' },
        { status: 400 },
      );
    }

    // Download audio file
    const audioRes = await fetch(mediaUrl);
    if (!audioRes.ok) {
      return NextResponse.json({ error: 'Failed to download audio file' }, { status: 502 });
    }
    const audioBlob = await audioRes.blob();

    const formData = new FormData();
    formData.append('file', audioBlob, 'voice-note.ogg');
    formData.append('model', 'whisper-1');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAiKey}` },
      body: formData,
    });

    const whisperData = await whisperRes.json().catch(() => ({}));
    if (!whisperRes.ok) {
      return NextResponse.json(
        { error: whisperData?.error?.message || 'Whisper transcription failed' },
        { status: 502 },
      );
    }

    const transcript = typeof whisperData?.text === 'string' ? whisperData.text.trim() : '';

    if (messageId && transcript) {
      await supabase
        .from('messages')
        .update({ content_text: `🎤 ${transcript}` })
        .eq('id', messageId);
    }

    return NextResponse.json({ success: true, text: transcript });
  } catch (err) {
    return toErrorResponse(err);
  }
}
