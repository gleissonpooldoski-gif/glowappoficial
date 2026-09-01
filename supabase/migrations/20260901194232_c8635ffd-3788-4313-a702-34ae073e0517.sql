CREATE TABLE IF NOT EXISTS public.project_edit_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  aspect_ratio text NOT NULL DEFAULT '9:16',
  doc jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_edit_models TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_edit_models TO anon;
GRANT ALL ON public.project_edit_models TO service_role;

ALTER TABLE public.project_edit_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_edit_models_all" ON public.project_edit_models;
CREATE POLICY "project_edit_models_all" ON public.project_edit_models FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_project_edit_models_updated ON public.project_edit_models;
CREATE TRIGGER trg_project_edit_models_updated BEFORE UPDATE ON public.project_edit_models
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.edits ADD COLUMN IF NOT EXISTS doc_overridden boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_edits_project_status ON public.edits(project_id, status);