import { useEffect, useState } from "react";
import { AlertTriangle, MessageSquareText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ProjectAffiliateCard from "@/components/ProjectAffiliateCard";

type Project = { id: string; name: string };
type YtCred = { account: string; channel_title: string | null; scope: string | null };

const TARGETS = ["SESSÃO DA FRAME", "SESSÃO DA RESENHA"];

export default function CommentsConfig() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [creds, setCreds] = useState<YtCred[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: pj }, { data: yc }] = await Promise.all([
        supabase.from("projects").select("id, name").in("name", TARGETS),
        supabase.from("youtube_credentials" as any).select("account, channel_title, scope"),
      ]);
      setProjects((pj ?? []) as Project[]);
      setCreds(((yc ?? []) as any) as YtCred[]);
      setLoading(false);
    })();
  }, []);

  const missingScope = creds.filter(
    (c) => !(c.scope ?? "").includes("youtube.force-ssl"),
  );

  const ordered = TARGETS
    .map((n) => projects.find((p) => p.name === n))
    .filter(Boolean) as Project[];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-gradient text-black">
          <MessageSquareText size={20} />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Configuração de Comentários</h1>
          <p className="text-xs text-muted-foreground">
            Comentários monetizados automáticos por projeto no YouTube. Cada projeto usa somente sua própria oferta.
          </p>
        </div>
      </div>

      {missingScope.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4">
          <AlertTriangle size={16} className="mt-0.5 text-yellow-400 shrink-0" />
          <div className="text-xs">
            <div className="font-medium text-yellow-200">
              Reconecte os canais abaixo para autorizar comentários
            </div>
            <p className="mt-1 text-yellow-100/80">
              A API do YouTube exige o escopo <code className="text-gold">youtube.force-ssl</code> para publicar comentários.
              Os canais listados foram conectados antes desse escopo — sem reconectar, os comentários falham com
              <em> "insufficient authentication scopes"</em>.
            </p>
            <ul className="mt-2 list-disc pl-4 space-y-0.5">
              {missingScope.map((c) => (
                <li key={c.account}>{c.channel_title ?? c.account}</li>
              ))}
            </ul>
            <p className="mt-2">
              Vá em <strong>Configurações → YouTube</strong> e clique em <strong>Reconectar</strong> para cada canal acima.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-xs text-muted-foreground">Carregando…</div>
      ) : ordered.length === 0 ? (
        <div className="text-xs text-muted-foreground">Nenhum projeto compatível encontrado.</div>
      ) : (
        <div className="space-y-5">
          {ordered.map((p) => (
            <ProjectAffiliateCard key={p.id} projectId={p.id} projectName={p.name} />
          ))}
        </div>
      )}
    </div>
  );
}
