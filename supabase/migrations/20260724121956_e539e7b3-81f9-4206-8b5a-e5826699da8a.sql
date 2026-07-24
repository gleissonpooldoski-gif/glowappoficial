ALTER TABLE public.facebook_accounts
  ADD COLUMN IF NOT EXISTS connection_status text NOT NULL DEFAULT 'connected',
  ADD COLUMN IF NOT EXISTS token_checked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS token_error text;

ALTER TABLE public.facebook_accounts
  DROP CONSTRAINT IF EXISTS facebook_accounts_connection_status_check;

ALTER TABLE public.facebook_accounts
  ADD CONSTRAINT facebook_accounts_connection_status_check
  CHECK (connection_status IN ('connected', 'expired'));

CREATE INDEX IF NOT EXISTS facebook_accounts_connection_status_idx
  ON public.facebook_accounts (connection_status);

UPDATE public.facebook_accounts
SET connection_status = 'connected',
    token_error = NULL
WHERE connection_status IS NULL;