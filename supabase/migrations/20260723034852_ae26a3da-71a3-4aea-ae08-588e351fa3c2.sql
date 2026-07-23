DROP INDEX IF EXISTS public.publish_targets_facebook_post_id_key;

ALTER TABLE public.publish_targets
ADD CONSTRAINT publish_targets_facebook_post_id_key UNIQUE (facebook_post_id);