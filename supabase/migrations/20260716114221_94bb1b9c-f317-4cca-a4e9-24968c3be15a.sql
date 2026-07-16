
DO $$ BEGIN
  CREATE TYPE public.render_job_status AS ENUM ('QUEUED','PROCESSING','COMPLETED','FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.render_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edit_id UUID REFERENCES public.edits(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  video_id UUID REFERENCES public.videos(id) ON DELETE SET NULL,
  user_id UUID,
  status public.render_job_status NOT NULL DEFAULT 'QUEUED',
  provider TEXT NOT NULL DEFAULT 'external-worker',
  external_job_id TEXT,
  composition JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_path TEXT,
  output_url TEXT,
  progress INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.render_jobs TO authenticated;
GRANT SELECT ON public.render_jobs TO anon;
GRANT ALL ON public.render_jobs TO service_role;

ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "render_jobs read all"
  ON public.render_jobs FOR SELECT
  USING (true);

CREATE POLICY "render_jobs insert any auth"
  ON public.render_jobs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "render_jobs update any auth"
  ON public.render_jobs FOR UPDATE
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "render_jobs delete any auth"
  ON public.render_jobs FOR DELETE
  TO authenticated
  USING (true);

CREATE TRIGGER update_render_jobs_updated_at
  BEFORE UPDATE ON public.render_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS render_jobs_status_idx ON public.render_jobs(status);
CREATE INDEX IF NOT EXISTS render_jobs_edit_idx ON public.render_jobs(edit_id);
