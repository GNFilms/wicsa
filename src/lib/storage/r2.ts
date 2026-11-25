/**
 * Cloudflare R2 helper for reusable sample videos & media (0 egress fees).
 * Set R2_PUBLIC_URL (e.g. https://media.yourdomain.com) in Vercel Environment Variables
 * to serve reusable sample reels without using Supabase Storage bandwidth.
 */
export function getR2PublicUrl(key: string): string | null {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || process.env.R2_PUBLIC_URL;
  if (!base) return null;
  const cleanBase = base.replace(/\/+$/, '');
  const cleanKey = key.replace(/^\/+/, '');
  return `${cleanBase}/${cleanKey}`;
}

export function isR2Configured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_R2_PUBLIC_URL || process.env.R2_PUBLIC_URL);
}
