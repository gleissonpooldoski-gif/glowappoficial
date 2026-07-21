
-- Lock por creation_id (garante um único polling ativo)
CREATE TABLE IF NOT EXISTS public.instagram_publish_locks (
  creation_id TEXT PRIMARY KEY,
  post_id UUID,
  ig_business_id TEXT,
  status TEXT NOT NULL DEFAULT 'processing',
  polling_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INT NOT NULL DEFAULT 0,
  last_request_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.instagram_publish_locks TO service_role;
ALTER TABLE public.instagram_publish_locks ENABLE ROW LEVEL SECURITY;

-- Fila / cooldown por conta Instagram (uma publicação por vez por ig_business_id)
CREATE TABLE IF NOT EXISTS public.instagram_account_locks (
  ig_business_id TEXT PRIMARY KEY,
  post_id UUID,
  creation_id TEXT,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cooldown_until TIMESTAMPTZ,
  last_error_code INT
);
GRANT ALL ON public.instagram_account_locks TO service_role;
ALTER TABLE public.instagram_account_locks ENABLE ROW LEVEL SECURITY;
