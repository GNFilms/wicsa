import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export const dynamic = 'force-dynamic';

const KNOWN_BUCKETS = ['chat-media', 'flow-media', 'avatars'];
const DEFAULT_THRESHOLD_MB = 700;
const DEFAULT_MAX_AGE_DAYS = 7;

async function listBucketFiles(
  admin: ReturnType<typeof supabaseAdmin>,
  bucket: string,
  folder = '',
  depth = 0,
): Promise<Array<{ id: string; path: string; bucket: string; size: number; mimeType: string; createdAt: string }>> {
  if (depth > 5) return [];
  const { data, error } = await admin.storage.from(bucket).list(folder, {
    limit: 100,
    sortBy: { column: 'created_at', order: 'asc' },
  });
  if (error || !data) return [];

  let items: Array<{ id: string; path: string; bucket: string; size: number; mimeType: string; createdAt: string }> = [];
  for (const item of data) {
    const itemPath = folder ? `${folder}/${item.name}` : item.name;
    if (item.id === null || !item.metadata || !('size' in item.metadata)) {
      items = items.concat(await listBucketFiles(admin, bucket, itemPath, depth + 1));
    } else {
      items.push({
        id: item.id || `${bucket}-${itemPath}`,
        path: itemPath,
        bucket,
        size: Number(item.metadata?.size || 0),
        mimeType: String(item.metadata?.mimetype || 'application/octet-stream'),
        createdAt: item.created_at || item.updated_at || new Date().toISOString(),
      });
    }
  }
  return items;
}

/**
 * GET /api/storage/cleanup
 * Nightly Vercel Cron job: removes video/audio > 7 days in chat-media,
 * and if total storage > 700 MB, removes oldest video/audio first (avatars untouched).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admin = supabaseAdmin();
    let allFiles: Array<{ id: string; path: string; bucket: string; size: number; mimeType: string; createdAt: string }> = [];
    for (const b of KNOWN_BUCKETS) {
      allFiles = allFiles.concat(await listBucketFiles(admin, b));
    }

    allFiles.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const thresholdBytes = DEFAULT_THRESHOLD_MB * 1024 * 1024;
    const cutoffMs = Date.now() - DEFAULT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    const isVideoOrAudio = (f: { mimeType: string }) =>
      f.mimeType.startsWith('video/') || f.mimeType.startsWith('audio/');

    const totalBytes = allFiles.reduce((acc, f) => acc + f.size, 0);
    const byBucket = new Map<string, string[]>();
    const selectedIds = new Set<string>();
    let freedBytes = 0;

    const mark = (f: typeof allFiles[number]) => {
      if (selectedIds.has(f.id)) return;
      selectedIds.add(f.id);
      const list = byBucket.get(f.bucket) || [];
      list.push(f.path);
      byBucket.set(f.bucket, list);
      freedBytes += f.size;
    };

    // Pass 1: chat-media video/audio > 7 days
    for (const f of allFiles) {
      if (f.bucket === 'chat-media' && isVideoOrAudio(f) && new Date(f.createdAt).getTime() < cutoffMs) {
        mark(f);
      }
    }
    // Pass 2: oldest video/audio if still over 700 MB
    for (const f of allFiles) {
      if (totalBytes - freedBytes <= thresholdBytes) break;
      if (f.bucket !== 'avatars' && isVideoOrAudio(f)) mark(f);
    }
    // Pass 3: last resort non-avatar files
    for (const f of allFiles) {
      if (totalBytes - freedBytes <= thresholdBytes) break;
      if (f.bucket !== 'avatars') mark(f);
    }

    let deletedCount = 0;
    for (const [bucket, paths] of byBucket.entries()) {
      const { data, error } = await admin.storage.from(bucket).remove(paths);
      if (!error) deletedCount += data?.length ?? paths.length;
    }

    return NextResponse.json({
      success: true,
      deletedCount,
      freedBytes,
      remainingBytes: Math.max(0, totalBytes - freedBytes),
    });
  } catch (err: unknown) {
    console.error('Nightly storage cleanup error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cleanup failed' },
      { status: 500 },
    );
  }
}
