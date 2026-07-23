GRANT SELECT ON public.facebook_posts TO anon;
GRANT SELECT ON public.facebook_posts TO authenticated;
GRANT ALL ON public.facebook_posts TO service_role;

DROP POLICY IF EXISTS "facebook_posts read all" ON public.facebook_posts;
CREATE POLICY "facebook_posts read all"
ON public.facebook_posts
FOR SELECT
TO anon, authenticated
USING (true);