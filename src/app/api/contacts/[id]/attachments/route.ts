import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getCurrentAccount();
    const { id: contactId } = await params;

    if (!contactId) {
      return NextResponse.json({ error: 'Contact ID is required' }, { status: 400 });
    }

    const { data, error } = await ctx.supabase
      .from('contact_attachments')
      .select('*')
      .eq('contact_id', contactId)
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === '42P01') {
        // Table not created yet — return empty list gracefully
        return NextResponse.json({ attachments: [] });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ attachments: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole('agent');
    const { id: contactId } = await params;

    if (!contactId) {
      return NextResponse.json({ error: 'Contact ID is required' }, { status: 400 });
    }

    const contentType = request.headers.get('content-type') || '';
    let fileName = 'attachment';
    let fileUrl = '';
    let mimeType = 'image/png';
    let fileSize = 0;
    let category = 'general';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      category = (formData.get('category') as string) || 'general';
      const customName = formData.get('file_name') as string | null;

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      fileName = customName || file.name || 'attachment';
      mimeType = file.type || 'image/png';
      fileSize = file.size;

      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = fileName.split('.').pop()?.toLowerCase() || 'png';
      const filePath = `attachments/${ctx.accountId}/${contactId}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

      const admin = supabaseAdmin();
      // Bucket 'avatars' is public and always exists
      const { error: uploadError } = await admin.storage
        .from('avatars')
        .upload(filePath, buffer, {
          contentType: mimeType,
          upsert: true,
          cacheControl: '3600',
        });

      if (uploadError) {
        console.error('[Attachment Upload Error]:', uploadError);
        return NextResponse.json(
          { error: uploadError.message || 'Failed to upload attachment' },
          { status: 500 },
        );
      }

      const { data: pubData } = admin.storage.from('avatars').getPublicUrl(filePath);
      fileUrl = pubData.publicUrl;
    } else {
      const body = (await request.json().catch(() => null)) as {
        file_url?: string;
        file_name?: string;
        file_type?: string;
        category?: string;
        dataUrl?: string;
      } | null;

      if (!body) {
        return NextResponse.json({ error: 'Invalid JSON request' }, { status: 400 });
      }

      category = body.category || 'general';
      fileName = body.file_name || 'attachment';

      if (body.dataUrl) {
        // Base64 image
        const matches = body.dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
          return NextResponse.json({ error: 'Invalid image data' }, { status: 400 });
        }

        mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        fileSize = buffer.length;

        const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
        const filePath = `attachments/${ctx.accountId}/${contactId}/${Date.now()}-screenshot.${ext}`;

        const admin = supabaseAdmin();
        const { error: uploadError } = await admin.storage
          .from('avatars')
          .upload(filePath, buffer, {
            contentType: mimeType,
            upsert: true,
            cacheControl: '3600',
          });

        if (uploadError) {
          return NextResponse.json({ error: uploadError.message }, { status: 500 });
        }

        const { data: pubData } = admin.storage.from('avatars').getPublicUrl(filePath);
        fileUrl = pubData.publicUrl;
      } else if (body.file_url) {
        fileUrl = body.file_url;
        mimeType = body.file_type || 'image/png';
      } else {
        return NextResponse.json({ error: 'No file URL or data provided' }, { status: 400 });
      }
    }

    const { data: attachment, error: dbError } = await ctx.supabase
      .from('contact_attachments')
      .insert({
        account_id: ctx.accountId,
        contact_id: contactId,
        file_name: fileName,
        file_url: fileUrl,
        file_type: mimeType,
        file_size: fileSize,
        category: category,
        created_by_user_id: ctx.userId,
      })
      .select()
      .single();

    if (dbError) {
      console.error('[Attachment DB Insert Error]:', dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, attachment }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole('agent');
    const { searchParams } = new URL(request.url);
    const attachmentId = searchParams.get('attachmentId');

    if (!attachmentId) {
      return NextResponse.json({ error: 'Attachment ID is required' }, { status: 400 });
    }

    const { error } = await ctx.supabase
      .from('contact_attachments')
      .delete()
      .eq('id', attachmentId)
      .eq('account_id', ctx.accountId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
