import { createClient } from "@/lib/supabase/client";

/**
 * Shared media-upload helper for Supabase Storage buckets that use the
 * account-scoped path convention introduced in migration 020
 * (`flow-media`) and reused by migration 023 (`chat-media`):
 *
 *   <bucket>/account-<account_id>/<timestamp>-<basename>.<ext>
 *
 * The first path segment (`account-<uuid>`) is what the bucket's RLS
 * write policies match on, so every caller MUST go through here rather
 * than hand-rolling a path — a mismatched segment is silently rejected
 * by RLS. Both the Flows builder (`node-config-form`) and the inbox
 * composer call this so the logic lives in exactly one place.
 */

/** 100 MB upload ceiling. */
export const MEDIA_MAX_BYTES = 100 * 1024 * 1024;

/**
 * Per-kind upload ceilings: allows up to 100 MB per file across
 * image, video, audio, and documents.
 */
export const MEDIA_MAX_BYTES_BY_KIND = {
  image: 100 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
  document: 100 * 1024 * 1024,
} as const;

/**
 * Build the account-scoped object path for an upload. Pure + exported so
 * it can be unit-tested without a Supabase client.
 *
 * - `basename` is stripped of its extension, lower-cased non-safe chars
 *   are collapsed to `_`, and it's capped at 40 chars (falls back to
 *   "file" when empty).
 * - The timestamp + the original name keep collisions between two
 *   concurrent uploads astronomically unlikely.
 *
 * `now = null` omits the timestamp prefix entirely. That's for callers
 * whose name is already unique AND who need the path to be *stable*
 * across repeated calls — the inbound mirror (`@/lib/whatsapp/
 * mirror-inbound-media`) keys on Meta's media id so a redelivered
 * webhook rewrites one object instead of orphaning a second copy.
 *
 * `subfolder` inserts one level below `account-<id>`. The bucket's RLS
 * write policies only match the FIRST path segment (migrations 020/023),
 * so nesting below it is free.
 */
export function buildMediaPath(
  accountId: string,
  fileName: string,
  now: number | null = Date.now(),
  subfolder?: string,
): string {
  // Only treat the trailing segment as an extension when there's a real
  // one — a bare name like "README" has no extension and falls back to
  // "bin" rather than becoming "readme".
  const hasExt = /\.[^.]+$/.test(fileName);
  const ext = hasExt ? fileName.split(".").pop()!.toLowerCase() : "bin";
  const safeBase =
    fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .slice(0, 40) || "file";
  const dir = subfolder
    ? `account-${accountId}/${subfolder}`
    : `account-${accountId}`;
  const stamp = now === null ? "" : `${now}-`;
  return `${dir}/${stamp}${safeBase}.${ext}`;
}

export interface UploadAccountMediaResult {
  /** Public URL Meta can fetch at send time. */
  publicUrl: string;
  /** Storage object path (account-scoped). */
  path: string;
}

/**
 * Upload a file to an account-scoped Storage bucket and return its public
 * URL. Throws with a user-facing message on auth / account-resolution /
 * upload failure — callers surface it via a toast.
 *
 * Size validation is the caller's responsibility (limits can differ per
 * feature); `MEDIA_MAX_BYTES` is exported for the common case.
 */
/**
 * Instant client-side image compression using HTML5 Canvas.
 * - Avatars (profile pics): max 400x400px, ~20-40 KB
 * - Pamphlets / Posters / Chat images: max 1400px, ~80-180 KB
 * Returns the original file if not an image, if SVG/GIF, or if compression doesn't save space.
 */
async function compressImageIfNeeded(file: File, bucket: string): Promise<File> {
  if (typeof window === "undefined" || typeof document === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;
  // Skip tiny images already under 60 KB
  if (file.size <= 60 * 1024) return file;

  const isAvatar = bucket === "avatars";
  const maxDim = isAvatar ? 400 : 1400;
  const quality = isAvatar ? 0.75 : 0.78;

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      const url = URL.createObjectURL(file);
      el.onload = () => {
        URL.revokeObjectURL(url);
        resolve(el);
      };
      el.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };
      el.src = url;
    });

    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      if (width >= height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob || blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export async function uploadAccountMedia(
  bucket: string,
  file: File,
): Promise<UploadAccountMediaResult> {
  const supabase = createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new Error("Not signed in.");
  }

  // Compress images on the spot before uploading
  const fileToUpload = await compressImageIfNeeded(file, bucket);

  // Resolve account_id so the path is account-scoped (matches the
  // bucket's RLS write policy from migration 020/023). User-scoped
  // paths would be rejected.
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileErr || !profile?.account_id) {
    throw new Error("Could not resolve your account.");
  }

  const ext = fileToUpload.name.split('.').pop()?.toLowerCase();
  let contentType = fileToUpload.type;
  if (ext === 'mp3') {
    contentType = 'audio/mpeg';
  } else if (ext === 'wav') {
    contentType = 'audio/wav';
  } else if (ext === 'ogg') {
    contentType = 'audio/ogg';
  } else if (ext === 'm4a') {
    contentType = 'audio/mp4';
  } else if (ext === 'aac') {
    contentType = 'audio/aac';
  }

  const path = buildMediaPath(profile.account_id as string, fileToUpload.name);
  let targetBucket = bucket;
  const isAudio = contentType?.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext || '');
  if (targetBucket === 'flow-media' && isAudio) {
    targetBucket = 'chat-media';
  }

  let { error: upErr } = await supabase.storage.from(targetBucket).upload(path, fileToUpload, {
    cacheControl: "3600",
    upsert: false,
    contentType: contentType || undefined,
  });

  if (upErr && (upErr.message.includes('mime type') || upErr.message.includes('not supported')) && targetBucket !== 'chat-media') {
    targetBucket = 'chat-media';
    const retry = await supabase.storage.from('chat-media').upload(path, fileToUpload, {
      cacheControl: "3600",
      upsert: false,
      contentType: contentType || undefined,
    });
    upErr = retry.error;
  }

  if (upErr) throw new Error(upErr.message);

  const {
    data: { publicUrl },
  } = supabase.storage.from(targetBucket).getPublicUrl(path);

  return { publicUrl, path };
}

/**
 * Delete a previously-uploaded object. Used to GC media that was staged
 * (uploaded) but never sent — a cancelled draft or a failed Meta send —
 * so abandoned attachments don't accumulate in the public bucket. The
 * DELETE is gated by the same account-scoped RLS policy as the upload,
 * so a caller can only remove objects under their own account folder.
 *
 * Best-effort: callers fire-and-forget and swallow errors (a missed
 * delete is a storage nit, not something to surface to the user).
 */
export async function deleteAccountMedia(
  bucket: string,
  path: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw new Error(error.message);
}
