-- ============================================================
-- 047_storage_media_types.sql
--
-- Remove MIME type restrictions on flow-media and chat-media storage buckets
-- so any audio, video, image, or document formats (including audio/mpeg,
-- video/mpeg, wav, ogg, etc.) can be uploaded up to 100MB without rejection.
-- ============================================================

UPDATE storage.buckets
SET allowed_mime_types = NULL,
    file_size_limit = 104857600
WHERE id IN ('chat-media', 'flow-media');

