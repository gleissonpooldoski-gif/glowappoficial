
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_path text,
  ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'video_status'::regtype AND enumlabel = 'pending') THEN
    ALTER TYPE video_status ADD VALUE 'pending';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'video_status'::regtype AND enumlabel = 'uploading') THEN
    ALTER TYPE video_status ADD VALUE 'uploading';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'video_status'::regtype AND enumlabel = 'completed') THEN
    ALTER TYPE video_status ADD VALUE 'completed';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'video_status'::regtype AND enumlabel = 'failed') THEN
    ALTER TYPE video_status ADD VALUE 'failed';
  END IF;
END $$;
