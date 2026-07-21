DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'instagram_connection_status') THEN
    CREATE TYPE public.instagram_connection_status AS ENUM ('CONNECTED', 'PENDING', 'ERROR');
  END IF;
END $$;

ALTER TABLE public.instagram_credentials
  ADD COLUMN IF NOT EXISTS connection_status public.instagram_connection_status NOT NULL DEFAULT 'CONNECTED'::public.instagram_connection_status;

UPDATE public.instagram_credentials
SET connection_status = 'CONNECTED'::public.instagram_connection_status
WHERE connection_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_instagram_credentials_connection_status
  ON public.instagram_credentials (connection_status);
