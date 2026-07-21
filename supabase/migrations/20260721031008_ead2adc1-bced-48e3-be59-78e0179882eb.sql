
CREATE TABLE public.youtube_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NULL,
  account TEXT NOT NULL DEFAULT 'default',
  channel_id TEXT NULL,
  channel_title TEXT NULL,
  thumbnail TEXT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NULL,
  scope TEXT NULL,
  expires_at TIMESTAMPTZ NULL,
  last_validated_at TIMESTAMPTZ NULL,
  last_validation_status TEXT NULL,
  last_validation_detail TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT youtube_credentials_account_unique UNIQUE (account)
);

GRANT SELECT ON public.youtube_credentials TO authenticated, anon;
GRANT ALL ON public.youtube_credentials TO service_role;

ALTER TABLE public.youtube_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read youtube credential status"
  ON public.youtube_credentials FOR SELECT
  USING (true);

CREATE TRIGGER update_youtube_credentials_updated_at
  BEFORE UPDATE ON public.youtube_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.youtube_oauth_states (
  state TEXT NOT NULL PRIMARY KEY,
  account TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.youtube_oauth_states TO service_role;
ALTER TABLE public.youtube_oauth_states ENABLE ROW LEVEL SECURITY;
