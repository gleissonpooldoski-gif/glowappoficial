
-- Tabela: oferta/afiliado por projeto (1 por projeto)
CREATE TABLE public.project_affiliate_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  product_category text,
  affiliate_link text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_affiliate_configs TO authenticated;
GRANT ALL ON public.project_affiliate_configs TO service_role;
ALTER TABLE public.project_affiliate_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_configs_all_auth" ON public.project_affiliate_configs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_affiliate_configs_updated BEFORE UPDATE ON public.project_affiliate_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela: modelos de comentário por projeto
CREATE TABLE public.project_comment_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  template text NOT NULL,
  position int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_comment_templates_project ON public.project_comment_templates(project_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_comment_templates TO authenticated;
GRANT ALL ON public.project_comment_templates TO service_role;
ALTER TABLE public.project_comment_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comment_templates_all_auth" ON public.project_comment_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_comment_templates_updated BEFORE UPDATE ON public.project_comment_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Colunas de rastreamento de comentário no YouTube
ALTER TABLE public.youtube_posts
  ADD COLUMN IF NOT EXISTS comment_status text,
  ADD COLUMN IF NOT EXISTS comment_id text,
  ADD COLUMN IF NOT EXISTS comment_text text,
  ADD COLUMN IF NOT EXISTS comment_error text,
  ADD COLUMN IF NOT EXISTS comment_posted_at timestamptz;

-- Seed: FRAME FINAL -> Cineflix
INSERT INTO public.project_affiliate_configs (project_id, product_name, product_category, affiliate_link)
SELECT id, 'Cineflix', 'Filmes, séries e entretenimento', 'https://cineflix.example/?ref=trocar'
FROM public.projects WHERE name = 'O FRAME FINAL'
ON CONFLICT (project_id) DO NOTHING;

INSERT INTO public.project_comment_templates (project_id, template, position)
SELECT p.id, t.template, t.position
FROM public.projects p
JOIN (VALUES
  (E'🍿 Quer assistir milhares de filmes, séries e canais em um só lugar?\nConheça a Cineflix:\n[link]', 0),
  (E'📺 Gostou desse conteúdo?\nTenha acesso a filmes, séries e muito mais com a Cineflix:\n[link]', 1),
  (E'🔥 Para quem ama entretenimento, vale conhecer a Cineflix:\n[link]', 2)
) AS t(template, position) ON TRUE
WHERE p.name = 'O FRAME FINAL'
  AND NOT EXISTS (SELECT 1 FROM public.project_comment_templates c WHERE c.project_id = p.id);

-- Seed: SESSÃO DA RESENHA -> Helix Brazil
INSERT INTO public.project_affiliate_configs (project_id, product_name, product_category, affiliate_link)
SELECT id, 'Helix Brazil', 'Jogo de habilidade', 'https://helixbrazil.site/?ref=BDRDJL'
FROM public.projects WHERE name = 'SESSÃO DA RESENHA'
ON CONFLICT (project_id) DO NOTHING;

INSERT INTO public.project_comment_templates (project_id, template, position)
SELECT p.id, t.template, t.position
FROM public.projects p
JOIN (VALUES
  (E'🎮 Gosta de desafios e jogos de habilidade?\nConheça a Helix Brazil:\n[link]', 0),
  (E'🔥 Quer testar uma nova experiência de entretenimento?\nConfira a Helix Brazil:\n[link]', 1),
  (E'🕹️ Para quem curte jogos e desafios, conheça:\n[link]', 2)
) AS t(template, position) ON TRUE
WHERE p.name = 'SESSÃO DA RESENHA'
  AND NOT EXISTS (SELECT 1 FROM public.project_comment_templates c WHERE c.project_id = p.id);
