
CREATE TABLE public.instagram_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account TEXT NOT NULL UNIQUE CHECK (account IN ('resenha','frame')),
  access_token TEXT NOT NULL,
  ig_business_id TEXT NOT NULL,
  last_validated_at TIMESTAMPTZ,
  last_validation_status TEXT,
  last_validation_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.instagram_credentials TO service_role;

ALTER TABLE public.instagram_credentials ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: only service_role (Edge Functions) can read/write.

CREATE TRIGGER update_instagram_credentials_updated_at
BEFORE UPDATE ON public.instagram_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
