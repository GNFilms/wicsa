-- ============================================================
-- 045_increase_media_file_size_limit.sql
--
-- Increases storage.buckets file_size_limit for chat-media and
-- flow-media so users are not limited to 16 MB per file.
-- ============================================================

UPDATE storage.buckets
SET file_size_limit = 104857600 -- 100 MB
WHERE id IN ('chat-media', 'flow-media');

