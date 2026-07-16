import { useEffect, useState } from "react";
import { Download, Trash2, Eye, Film, Package } from "lucide-react";
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

export default function Finished() {
  const [videos, setVideos] = useState<any[] | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("videos")
      .select("*, templates(name)")
      .eq("status", "finished")
      .order("updated_at", { ascending: false });
    setVideos(data ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const download = async (v: any) => {
    if (!v.processed_path) {
      toast.info("Arquivo ainda não disponível.");
      return;
    }
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(v.processed_path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  const remove = async (v: any) => {
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
            Baixe seus vídeos finalizados e publique manualmente nas redes.
          </p>
        </div>
        <Button variant="outline" className="border-border/60" disabled>
          <Package size={14} className="mr-1" /> Baixar todos (ZIP) — em breve
        </Button>
      </header>

      {!videos ? (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <Card className="glass border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Film className="text-gold" />
            <p className="text-sm text-muted-foreground">
              Nenhum vídeo finalizado. Envie a fila em <b>Processamentos</b>.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {videos.map((v) => (
            <Card key={v.id} className="glass border-border/50 group overflow-hidden">
              <div className="relative aspect-[9/16] bg-black flex items-center justify-center">
                <Film className="text-gold/40" size={32} />
                <Badge className="absolute left-2 top-2 border-gold/40 bg-black/70 text-[10px] text-gold" variant="outline">
                  Finalizado
                </Badge>
              </div>
              <CardContent className="p-3">
                <p className="truncate text-xs font-medium">{v.filename}</p>
                <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{format(new Date(v.updated_at ?? v.created_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                  <span>{formatBytes(v.size_bytes)}</span>
                </div>
                {v.templates?.name && (
                  <p className="mt-1 text-[10px] text-gold">{v.templates.name}</p>
                )}
                <div className="mt-2 flex gap-1">
                  <Button size="sm" variant="outline" className="h-7 flex-1 text-[11px]" onClick={() => download(v)}>
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
          ))}
        </div>
      )}
    </div>
  );
}
