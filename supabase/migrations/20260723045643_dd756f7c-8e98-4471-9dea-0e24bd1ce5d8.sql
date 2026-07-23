
ALTER TABLE public.youtube_credentials
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS youtube_credentials_project_id_key
  ON public.youtube_credentials(project_id) WHERE project_id IS NOT NULL;

-- Backfill based on channel_title matching current projects.
UPDATE public.youtube_credentials
  SET project_id = 'd5f161c5-5bf2-4aa7-ab4b-c2ed1c2dbc22'
  WHERE account = 'UCC01G_aAO0ax-vEZKd3BW_Q' AND project_id IS NULL;
UPDATE public.youtube_credentials
  SET project_id = '05848845-b2c3-42e2-8750-1fadde32ffd6'
  WHERE account = 'default' AND project_id IS NULL;
UPDATE public.youtube_credentials
  SET project_id = '458748ef-c8bd-4af8-8462-f5f8e09daae7'
  WHERE account = 'UCySb7ryXclB6wxoMt-mE3UA' AND project_id IS NULL;

-- Allow authenticated users to set/clear the project link (only project_id changes matter).
DROP POLICY IF EXISTS "Authenticated can link youtube channel to project" ON public.youtube_credentials;
CREATE POLICY "Authenticated can link youtube channel to project"
  ON public.youtube_credentials
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT UPDATE (project_id) ON public.youtube_credentials TO authenticated;
