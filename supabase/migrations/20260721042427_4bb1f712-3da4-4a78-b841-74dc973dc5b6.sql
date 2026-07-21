
ALTER TABLE public.publish_schedules
  ADD COLUMN IF NOT EXISTS network text NOT NULL DEFAULT 'instagram';

DROP INDEX IF EXISTS publish_schedules_account_category_key;

CREATE UNIQUE INDEX IF NOT EXISTS publish_schedules_network_account_category_key
  ON public.publish_schedules (network, account, COALESCE(category, ''));

INSERT INTO public.publish_schedules (network, account, times, posts_per_day)
SELECT 'youtube', 'default', '["10:00","15:00","20:00"]'::jsonb, 3
WHERE NOT EXISTS (
  SELECT 1 FROM public.publish_schedules WHERE network = 'youtube' AND account = 'default' AND category IS NULL
);
