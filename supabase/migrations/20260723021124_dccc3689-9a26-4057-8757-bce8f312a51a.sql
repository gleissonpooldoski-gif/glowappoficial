
CREATE TABLE public.facebook_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  page_picture TEXT,
  page_access_token TEXT NOT NULL,
  user_access_token TEXT,
  connection_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX facebook_accounts_project_unique
  ON public.facebook_accounts (project_id)
  WHERE project_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.facebook_accounts TO authenticated, anon;
GRANT ALL ON public.facebook_accounts TO service_role;

ALTER TABLE public.facebook_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "facebook_accounts_all_access"
  ON public.facebook_accounts
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_facebook_accounts_updated_at
  BEFORE UPDATE ON public.facebook_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
