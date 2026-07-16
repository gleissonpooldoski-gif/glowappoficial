import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Film, Rocket, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDuration } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState<any>(null);
  const [videos, setVideos] = useState<any[] | null>(null);
  const [queue, setQueue] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [pr, vids, q] = await Promise.all([
        supabase.from("projects").select("*").eq("id", id).maybeSingle(),
        supabase.from("videos").select("*").eq("project_id", id).order("created_at", { ascending: false }),
        supabase.from("processing_queue").select("*").eq("project_id", id).order("created_at", { ascending: false }),
      ]);
      setProject(pr.data);
      setVideos(vids.data ?? []);
      setQueue(q.data ?? []);
    })();
  }, [id]);

  const originals = (videos ?? []).filter((v) => v.status !== "finished");
  const processed = (videos ?? []).filter((v) => v.status === "finished");

  return (
    <div className="space-y-6">
      <Link to="/projects" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft size={12} /> Voltar
      </Link>

      {!project ? (
        <Skeleton className="h-24" />
      ) : (
        <header className="rounded-2xl border border-border/50 glass p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-gold">
                {project.category}
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{project.name}</h1>
              {project.description && (
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  {project.description}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" className="border-border/60">
                <Link to="/videos">
                  <Film size={14} className="mr-1" /> Enviar vídeos
                </Link>
              </Button>
              <Button asChild className="bg-gold-gradient text-black">
                <Link to="/edits">
                  <Rocket size={14} className="mr-1" /> Ir para projetos de edição
                </Link>
              </Button>
            </div>
          </div>
        </header>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Film size={16} className="text-gold" />
          <h2 className="text-sm font-medium">Vídeos originais ({originals.length})</h2>
        </div>
        <VideoGrid videos={originals} loading={!videos} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-gold" />
          <h2 className="text-sm font-medium">Vídeos processados ({processed.length})</h2>
        </div>
        <VideoGrid videos={processed} loading={!videos} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-gold" />
          <h2 className="text-sm font-medium">Histórico de geração ({queue.length})</h2>
        </div>
        {queue.length === 0 ? (
          <Card className="glass border-dashed">
            <CardContent className="py-8 text-center text-xs text-muted-foreground">
              Nenhuma geração ainda.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {queue.map((q) => (
              <div key={q.id} className="flex items-center justify-between rounded-lg border border-border/50 glass px-4 py-3">
                <div className="text-xs">
                  <span className="text-muted-foreground">
                    {format(new Date(q.created_at), "dd MMM HH:mm", { locale: ptBR })}
                  </span>
                </div>
                <Badge variant="outline" className="border-gold/30 text-gold">
                  {q.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function VideoGrid({ videos, loading }: { videos: any[]; loading: boolean }) {
  if (loading)
    return (
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  if (videos.length === 0)
    return (
      <Card className="glass border-dashed">
        <CardContent className="py-8 text-center text-xs text-muted-foreground">
          Nenhum vídeo aqui ainda.
        </CardContent>
      </Card>
    );
  return (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {videos.map((v) => (
        <Card key={v.id} className="glass border-border/50 overflow-hidden">
          <div className="aspect-[9/16] bg-black flex items-center justify-center">
            <Film className="text-gold/50" size={28} />
          </div>
          <CardContent className="p-3">
            <p className="truncate text-xs font-medium">{v.filename}</p>
            <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{formatDuration(v.duration_seconds)}</span>
              <span>{formatBytes(v.size_bytes)}</span>
            </div>
            <Badge variant="outline" className="mt-2 text-[10px] border-border/60">
              {v.status}
            </Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
