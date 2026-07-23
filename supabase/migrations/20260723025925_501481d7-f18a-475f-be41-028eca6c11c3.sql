-- Deduplicate any existing rows per project keeping the newest
DELETE FROM public.facebook_accounts a
USING public.facebook_accounts b
WHERE a.project_id = b.project_id
  AND a.ctid < b.ctid;

ALTER TABLE public.facebook_accounts
  ADD CONSTRAINT facebook_accounts_project_id_key UNIQUE (project_id);