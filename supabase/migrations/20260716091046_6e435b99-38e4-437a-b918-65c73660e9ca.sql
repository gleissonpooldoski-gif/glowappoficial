ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS category text DEFAULT 'Geral';
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS file_path text;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS file_type text;
DELETE FROM public.templates WHERE is_builtin = true;