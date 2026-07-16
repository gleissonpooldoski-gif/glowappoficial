import { useEffect, useState } from "react";
import { Download, Trash2, Film, Package, Play, Calendar, Clock, LayoutTemplate, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const BUCKET = "videos-processed";

type FinishedVideo = {
  id: string;
  filename: string;
  processed_path: string | null;
  processed_url: string | null;
  duration_seconds: number | null;
  size_bytes: number | null;
  created_at: string;
  updated_at: string;
  templates?: { name: string | null } | null;
};

const formatDuration = (s: number | null) => {
  if (!s || !isFinite(s)) return "—";
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
};

export default function Finished() {
  const [videos, setVideos] = useState<FinishedVideo[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const load = async () => {
    const { data } = await supabase
      .from("videos")
      .select("*, templates(name)")
      .eq("status", "finished")
      .order("updated_at", { ascending: false });
    const list = ((data ?? []) as any[]) as FinishedVideo[];
    setVideos(list);

    // Signed URLs for inline preview
    const next: Record<string, string> = {};
    await Promise.all(
      list.map(async (v) => {
        if (!v.processed_path) return;
        const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(v.processed_path, 60 * 60);
        if (s?.signedUrl) next[v.id] = s.signedUrl;
      })
    );
    setUrls(next);
  };

  useEffect(() => {
    load();
  }, []);

  const download = async (v: FinishedVideo) => {
    if (!v.processed_path) {
      toast.info("Arquivo ainda não disponível.");
      return;
    }
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(v.processed_path, 60, {
      download: v.filename,
    });
    if (error) return toast.error(error.message);
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = v.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const remove = async (v: FinishedVideo) => {
    if (!confirm(`Excluir "${v.filename}"?`)) return;
    if (v.processed_path) await supabase.storage.from(BUCKET).remove([v.processed_path]);
    await supabase.from("videos").delete().eq("id", v.id);
    load();
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vídeos Prontos</h1>
          <p className="text-sm text-muted-foreground">
            Seus vídeos finalizados. Reproduza, baixe ou exclua.
          </p>
        </div>
        <Button variant="outline" className="border-border/60" disabled>
          <Package size={14} className="mr-1" /> Baixar todos (ZIP) — em breve
        </Button>
      </header>

      {!videos ? (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <Card className="glass border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Film className="text-gold" />
            <p className="text-sm text-muted-foreground">
              Nenhum vídeo finalizado. Abra um projeto no editor e clique em <b>Pronto para baixar</b>.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {videos.map((v) => {
            const src = urls[v.id];
            return (
              <Card key={v.id} className="glass border-border/50 group overflow-hidden">
                <div className="relative aspect-[9/16] bg-black">
                  {src ? (
                    <video
                      src={src}
                      controls
                      preload="metadata"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Play className="text-gold/40" size={32} />
                    </div>
                  )}
                  <Badge
                    className="absolute left-2 top-2 border-emerald-400/40 bg-black/70 text-[10px] text-emerald-300"
                    variant="outline"
                  >
                    <CheckCircle2 size={10} className="mr-1" /> Concluído
                  </Badge>
                </div>
                <CardContent className="p-3">
                  <p className="truncate text-xs font-medium" title={v.filename}>
                    {v.filename}
                  </p>
                  <div className="mt-1.5 space-y-1 text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={10} />
                      {format(new Date(v.updated_at ?? v.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Clock size={10} /> {formatDuration(v.duration_seconds)}
                      </span>
                      <span>{formatBytes(v.size_bytes ?? 0)}</span>
                    </div>
                    {v.templates?.name && (
                      <div className="flex items-center gap-1.5 text-gold">
                        <LayoutTemplate size={10} /> {v.templates.name}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex gap-1">
                    <Button
                      size="sm"
                      className="h-7 flex-1 bg-gold-gradient text-[11px] text-black"
                      onClick={() => download(v)}
                    >
                      <Download size={12} className="mr-1" /> Baixar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(v)}
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
