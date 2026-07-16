-- 1. Add columns
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;

-- 2. Create "Legado" project if any orphan data exists
DO $$
DECLARE
  legacy_id UUID;
  has_orphans BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.videos WHERE project_id IS NULL
    UNION ALL SELECT 1 FROM public.edits WHERE project_id IS NULL
    UNION ALL SELECT 1 FROM public.templates WHERE project_id IS NULL
  ) INTO has_orphans;

  IF has_orphans THEN
    SELECT id INTO legacy_id FROM public.projects WHERE name = 'Legado' LIMIT 1;
    IF legacy_id IS NULL THEN
      INSERT INTO public.projects (name, category, description)
      VALUES ('Legado', 'outro', 'Projeto criado automaticamente para agrupar conteúdo anterior à separação por projetos.')
      RETURNING id INTO legacy_id;
    END IF;

    UPDATE public.videos    SET project_id = legacy_id WHERE project_id IS NULL;
    UPDATE public.edits     SET project_id = legacy_id WHERE project_id IS NULL;
    UPDATE public.templates SET project_id = legacy_id WHERE project_id IS NULL;
  END IF;
END $$;

-- 3. updated_at trigger for projects
DROP TRIGGER IF EXISTS trg_projects_updated_at ON public.projects;
CREATE TRIGGER trg_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();