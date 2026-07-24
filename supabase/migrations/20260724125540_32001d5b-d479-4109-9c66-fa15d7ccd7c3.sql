
GRANT SELECT ON public.publish_queue TO anon;
GRANT SELECT ON public.connection_health TO anon;
GRANT SELECT ON public.publish_events TO anon;

CREATE POLICY "anon read publish_queue" ON public.publish_queue FOR SELECT TO anon USING (true);
CREATE POLICY "anon read connection_health" ON public.connection_health FOR SELECT TO anon USING (true);
CREATE POLICY "anon read publish_events" ON public.publish_events FOR SELECT TO anon USING (true);
