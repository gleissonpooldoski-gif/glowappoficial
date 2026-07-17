
CREATE TABLE public.publish_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account TEXT NOT NULL,
  category TEXT,
  times JSONB NOT NULL DEFAULT '[]'::jsonb,
  posts_per_day INT NOT NULL DEFAULT 5,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX publish_schedules_account_category_key
  ON public.publish_schedules (account, COALESCE(category, ''));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.publish_schedules TO anon, authenticated;
GRANT ALL ON public.publish_schedules TO service_role;

ALTER TABLE public.publish_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read publish_schedules" ON public.publish_schedules FOR SELECT USING (true);
CREATE POLICY "Public insert publish_schedules" ON public.publish_schedules FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update publish_schedules" ON public.publish_schedules FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete publish_schedules" ON public.publish_schedules FOR DELETE USING (true);

CREATE TRIGGER update_publish_schedules_updated_at
  BEFORE UPDATE ON public.publish_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.publish_schedules (account, times, posts_per_day)
VALUES
  ('resenha', '["09:00","12:30","15:30","19:00","22:00"]'::jsonb, 5),
  ('frame',   '["09:00","12:30","15:30","19:00","22:00"]'::jsonb, 5);
