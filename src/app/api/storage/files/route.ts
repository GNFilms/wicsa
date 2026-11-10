import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { createClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

const KNOWN_BUCKETS = ['chat-media', 'flow-media', 'avatars'];

export interface StorageFileItem {
  id: string;
  name: string;
  path: string;
  bucket: string;
  size: number;
  mimeType: string;
  createdAt: string;
  updatedAt?: string;
  publicUrl: string;
}

async function listFolderRecursive(
  admin: ReturnType<typeof supabaseAdmin>,
  bucket: string,
  folder: string = '',
  depth: number = 0,
): Promise<StorageFileItem[]> {
  if (depth > 5) return [];

  const { data, error } = await admin.storage.from(bucket).list(folder, {
    limit: 100,
    sortBy: { column: 'created_at', order: 'desc' },
  });

  if (error || !data) {
    console.error(`Failed to list storage bucket ${bucket} folder ${folder}:`, error);
    return [];
  }

  let items: StorageFileItem[] = [];

  for (const item of data) {
    const itemPath = folder ? `${folder}/${item.name}` : item.name;

    // Supabase returns id === null or metadata === null for folder placeholders
    if (item.id === null || !item.metadata || !('size' in item.metadata)) {
      const sub = await listFolderRecursive(admin, bucket, itemPath, depth + 1);
      items = items.concat(sub);
    } else {
      const { data: pubData } = admin.storage.from(bucket).getPublicUrl(itemPath);
      items.push({
        id: item.id || `${bucket}-${itemPath}`,
        name: item.name,
        path: itemPath,
        bucket,
        size: Number(item.metadata?.size || 0),
        mimeType: String(item.metadata?.mimetype || 'application/octet-stream'),
        createdAt: item.created_at || item.updated_at || new Date().toISOString(),
        updatedAt: item.updated_at,
        publicUrl: pubData.publicUrl,
      });
    }
  }

  return items;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const bucketParam = searchParams.get('bucket');
    const bucketsToScan = bucketParam && KNOWN_BUCKETS.includes(bucketParam)
      ? [bucketParam]
      : KNOWN_BUCKETS;

    const admin = supabaseAdmin();
    let allFiles: StorageFileItem[] = [];

    for (const b of bucketsToScan) {
      const files = await listFolderRecursive(admin, b, '', 0);
      allFiles = allFiles.concat(files);
    }

    // Sort descending by size to immediately highlight large files causing egress quota exhaustion
    allFiles.sort((a, b) => b.size - a.size);

    const totalSizeBytes = allFiles.reduce((acc, f) => acc + f.size, 0);
    const bucketBreakdown: Record<string, { count: number; sizeBytes: number }> = {};

    for (const f of allFiles) {
      if (!bucketBreakdown[f.bucket]) {
        bucketBreakdown[f.bucket] = { count: 0, sizeBytes: 0 };
      }
      bucketBreakdown[f.bucket].count += 1;
      bucketBreakdown[f.bucket].sizeBytes += f.size;
    }

    return NextResponse.json({
      success: true,
      files: allFiles,
      totalFiles: allFiles.length,
      totalSizeBytes,
      bucketBreakdown,
    });
  } catch (err: unknown) {
    console.error('Storage files GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list storage files' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const itemsToDelete: Array<{ bucket: string; path: string }> = Array.isArray(body?.files)
      ? body.files
      : body?.bucket && body?.path
      ? [{ bucket: body.bucket, path: body.path }]
      : [];

    if (itemsToDelete.length === 0) {
      return NextResponse.json({ error: 'No files specified for deletion' }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const byBucket = new Map<string, string[]>();

    for (const item of itemsToDelete) {
      if (!item.bucket || !item.path) continue;
      const paths = byBucket.get(item.bucket) || [];
      paths.push(item.path);
      byBucket.set(item.bucket, paths);
    }

    let deletedCount = 0;
    const errors: string[] = [];

    for (const [bucket, paths] of byBucket.entries()) {
      const { data, error } = await admin.storage.from(bucket).remove(paths);
      if (error) {
        errors.push(`${bucket}: ${error.message}`);
      } else {
        deletedCount += data?.length ?? paths.length;
      }
    }

    return NextResponse.json({
      success: true,
      deletedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: unknown) {
    console.error('Storage files DELETE error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete storage files' },
      { status: 500 },
    );
  }
}

