
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'video_status' AND e.enumlabel = 'published'
  ) THEN
    ALTER TYPE public.video_status ADD VALUE 'published';
  END IF;
END$$;
