CREATE TABLE public.project_schedule_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'all',
  posts_per_day integer NOT NULL DEFAULT 5,
  publication_times jsonb NOT NULL DEFAULT '["09:00","12:30","15:30","19:00","22:00"]'::jsonb,
  start_date date,
  start_time time,
  last_scheduled_slot timestamptz,
  next_available_slot timestamptz,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_schedule_settings_unique UNIQUE (project_id, platform),
  CONSTRAINT project_schedule_settings_ppd CHECK (posts_per_day BETWEEN 1 AND 50)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_schedule_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_schedule_settings TO anon;
GRANT ALL ON public.project_schedule_settings TO service_role;

ALTER TABLE public.project_schedule_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public access project_schedule_settings"
ON public.project_schedule_settings FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_project_schedule_settings_updated_at
BEFORE UPDATE ON public.project_schedule_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_project_schedule_settings_project ON public.project_schedule_settings(project_id);

INSERT INTO public.project_schedule_settings (project_id, platform)
SELECT id, 'all' FROM public.projects
ON CONFLICT (project_id, platform) DO NOTHING;