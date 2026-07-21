
-- Add status column and label to support multiple YouTube channels per user.
ALTER TABLE public.youtube_credentials
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'connected',
  ADD COLUMN IF NOT EXISTS label TEXT;

-- Ensure channel_id uniqueness (so a re-auth of same channel merges instead of duplicating).
CREATE UNIQUE INDEX IF NOT EXISTS youtube_credentials_channel_id_uniq
  ON public.youtube_credentials(channel_id) WHERE channel_id IS NOT NULL;
