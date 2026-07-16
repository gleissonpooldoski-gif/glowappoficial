DO $$ BEGIN
  CREATE TYPE public.edit_status AS ENUM ('draft','editing','processing','completed','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES public.videos(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.templates(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  name TEXT,
  aspect_ratio TEXT NOT NULL DEFAULT '9:16',
  status public.edit_status NOT NULL DEFAULT 'draft',
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  queue_id UUID REFERENCES public.processing_queue(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.edits TO anon, authenticated;
GRANT ALL ON public.edits TO service_role;

ALTER TABLE public.edits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public access" ON public.edits;
CREATE POLICY "public read"   ON public.edits FOR SELECT USING (true);
CREATE POLICY "public insert" ON public.edits FOR INSERT WITH CHECK (true);
CREATE POLICY "public update" ON public.edits FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete" ON public.edits FOR DELETE USING (true);

DROP TRIGGER IF EXISTS trg_edits_updated ON public.edits;
CREATE TRIGGER trg_edits_updated BEFORE UPDATE ON public.edits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS edits_video_idx ON public.edits(video_id);
CREATE INDEX IF NOT EXISTS edits_status_idx ON public.edits(status);