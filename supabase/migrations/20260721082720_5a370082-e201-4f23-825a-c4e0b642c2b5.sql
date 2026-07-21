
ALTER TABLE public.instagram_credentials DROP CONSTRAINT IF EXISTS instagram_credentials_account_check;
ALTER TABLE public.instagram_posts DROP CONSTRAINT IF EXISTS instagram_posts_account_check;
ALTER TABLE public.instagram_credentials ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.instagram_credentials ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_instagram_credentials_project_id ON public.instagram_credentials(project_id);
UPDATE public.instagram_credentials SET display_name = COALESCE(display_name,
  CASE account WHEN 'resenha' THEN 'Sessão da Resenha' WHEN 'frame' THEN 'Sessão da Frame' ELSE account END);
