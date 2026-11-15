import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

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
    let avatarUrl: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "bigger image size , Take it's screenshot & paste it here" },
          { status: 400 },
        );
      }

      const mime = file.type || 'image/jpeg';
      if (!mime.startsWith('image/')) {
        return NextResponse.json(
          { error: 'Invalid file format. Please upload an image (JPEG, PNG, WEBP, etc.)' },
          { status: 400 },
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const cleanExt = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext) ? ext : 'png';
      const filePath = `contacts/${ctx.accountId}/${contactId}-${Date.now()}.${cleanExt}`;

      const admin = supabaseAdmin();
      const { error: uploadError } = await admin.storage
        .from('avatars')
        .upload(filePath, buffer, {
          contentType: mime,
          upsert: true,
          cacheControl: '3600',
        });

      if (uploadError) {
        console.error('[Avatar Upload Error]:', uploadError);
        return NextResponse.json(
          { error: uploadError.message || 'Failed to upload photo' },
          { status: 500 },
        );
      }

      const { data: pubData } = admin.storage.from('avatars').getPublicUrl(filePath);
      avatarUrl = pubData.publicUrl;
    } else {
      const body = (await request.json().catch(() => null)) as {
        avatar_url?: string;
        dataUrl?: string;
      } | null;

      if (!body) {
        return NextResponse.json({ error: 'Invalid JSON request' }, { status: 400 });
      }

      if (body.dataUrl) {
        // Handle Base64 dataUrl (e.g. from pasted clipboard screenshot)
        const matches = body.dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
          return NextResponse.json({ error: 'Invalid image data' }, { status: 400 });
        }

        const mime = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');

        if (buffer.length > MAX_FILE_SIZE) {
          return NextResponse.json(
            { error: "bigger image size , Take it's screenshot & paste it here" },
            { status: 400 },
          );
        }

        const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
        const filePath = `contacts/${ctx.accountId}/${contactId}-${Date.now()}.${ext}`;

        const admin = supabaseAdmin();
        const { error: uploadError } = await admin.storage
          .from('avatars')
          .upload(filePath, buffer, {
            contentType: mime,
            upsert: true,
            cacheControl: '3600',
          });

        if (uploadError) {
          console.error('[Avatar DataUrl Upload Error]:', uploadError);
          return NextResponse.json({ error: uploadError.message }, { status: 500 });
        }

        const { data: pubData } = admin.storage.from('avatars').getPublicUrl(filePath);
        avatarUrl = pubData.publicUrl;
      } else if (body.avatar_url) {
        avatarUrl = body.avatar_url.trim();
      } else {
        return NextResponse.json({ error: 'No avatar URL or file provided' }, { status: 400 });
      }
    }

    // Update the contact's avatar_url in the database
    const { data: contact, error: dbError } = await ctx.supabase
      .from('contacts')
      .update({
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId)
      .eq('account_id', ctx.accountId)
      .select()
      .single();

    if (dbError) {
      console.error('[Contact DB Update Error]:', dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, avatar_url: avatarUrl, contact });
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
    const { id: contactId } = await params;

    const { data: contact, error: dbError } = await ctx.supabase
      .from('contacts')
      .update({
        avatar_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId)
      .eq('account_id', ctx.accountId)
      .select()
      .single();

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, avatar_url: null, contact });
  } catch (err) {
    return toErrorResponse(err);
  }
}
