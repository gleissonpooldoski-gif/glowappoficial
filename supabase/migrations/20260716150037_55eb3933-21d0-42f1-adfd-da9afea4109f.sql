
CREATE INDEX IF NOT EXISTS videos_project_id_idx ON public.videos (project_id);
CREATE INDEX IF NOT EXISTS videos_status_idx ON public.videos (status);
CREATE INDEX IF NOT EXISTS videos_created_at_idx ON public.videos (created_at DESC);
CREATE INDEX IF NOT EXISTS videos_status_created_at_idx ON public.videos (status, created_at DESC);
CREATE INDEX IF NOT EXISTS videos_file_hash_idx ON public.videos (file_hash);
CREATE INDEX IF NOT EXISTS edits_project_id_idx ON public.edits (project_id);
CREATE INDEX IF NOT EXISTS edits_created_at_idx ON public.edits (created_at DESC);
CREATE INDEX IF NOT EXISTS edits_status_created_at_idx ON public.edits (status, created_at DESC);
CREATE INDEX IF NOT EXISTS render_jobs_created_at_idx ON public.render_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS render_jobs_video_id_idx ON public.render_jobs (video_id);
CREATE INDEX IF NOT EXISTS projects_created_at_idx ON public.projects (created_at DESC);
CREATE INDEX IF NOT EXISTS templates_created_at_idx ON public.templates (created_at DESC);
