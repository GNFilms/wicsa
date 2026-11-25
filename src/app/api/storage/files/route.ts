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
        updatedAt: item.updated_at || undefined,
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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const thresholdMb = Math.max(50, Math.min(1000, Number(body?.thresholdMb) || 700));
    const maxAgeDays = Math.max(1, Math.min(365, Number(body?.maxAgeDays) || 7));
    const thresholdBytes = thresholdMb * 1024 * 1024;
    const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

    const admin = supabaseAdmin();
    let allFiles: StorageFileItem[] = [];
    for (const b of KNOWN_BUCKETS) {
      const files = await listFolderRecursive(admin, b, '', 0);
      allFiles = allFiles.concat(files);
    }

    // Sort oldest first within each priority tier
    allFiles.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const isVideoOrAudio = (f: StorageFileItem) =>
      f.mimeType.startsWith('video/') || f.mimeType.startsWith('audio/');
    const isProtectedAvatar = (f: StorageFileItem) => f.bucket === 'avatars';

    let totalBytes = allFiles.reduce((acc, f) => acc + f.size, 0);
    const byBucket = new Map<string, string[]>();
    const selectedIds = new Set<string>();
    let freedBytes = 0;
    let toDeleteCount = 0;

    const markForDelete = (f: StorageFileItem) => {
      if (selectedIds.has(f.id)) return;
      selectedIds.add(f.id);
      const list = byBucket.get(f.bucket) || [];
      list.push(f.path);
      byBucket.set(f.bucket, list);
      freedBytes += f.size;
      toDeleteCount += 1;
    };

    // Pass 1: Delete video & audio files in chat-media older than maxAgeDays (7 days)
    for (const f of allFiles) {
      if (
        f.bucket === 'chat-media' &&
        isVideoOrAudio(f) &&
        new Date(f.createdAt).getTime() < cutoffMs
      ) {
        markForDelete(f);
      }
    }

    // Pass 2: If still over threshold, delete oldest video & audio files first
    for (const f of allFiles) {
      if (totalBytes - freedBytes <= thresholdBytes) break;
      if (!isProtectedAvatar(f) && isVideoOrAudio(f)) {
        markForDelete(f);
      }
    }

    // Pass 3 (Last resort): If still over threshold after all videos/audio are removed,
    // delete oldest non-avatar files (never touch client profile pictures in avatars)
    for (const f of allFiles) {
      if (totalBytes - freedBytes <= thresholdBytes) break;
      if (!isProtectedAvatar(f)) {
        markForDelete(f);
      }
    }

    if (toDeleteCount === 0) {
      return NextResponse.json({
        success: true,
        deletedCount: 0,
        freedBytes: 0,
        remainingBytes: totalBytes,
        message: 'Storage is already below threshold and no chat-media files are older than 7 days.',
      });
    }

    let deletedCount = 0;
    for (const [bucket, paths] of byBucket.entries()) {
      const { data, error } = await admin.storage.from(bucket).remove(paths);
      if (!error) {
        deletedCount += data?.length ?? paths.length;
      }
    }

    return NextResponse.json({
      success: true,
      deletedCount: deletedCount || toDeleteCount,
      freedBytes,
      remainingBytes: Math.max(0, totalBytes - freedBytes),
    });
  } catch (err: unknown) {
    console.error('Storage cleanup POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to run storage cleanup' },
      { status: 500 },
    );
  }
}

