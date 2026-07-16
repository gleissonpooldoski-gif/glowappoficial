import { useCallback, useEffect, useRef, useState } from "react";
import { Film, Upload, Trash2, Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBytes, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

const BUCKET = "videos-original";
const ACCEPT = ["video/mp4", "video/quicktime", "video/webm"];

type Video = {
  id: string;
  project_id: string | null;
  filename: string;
  original_path: string | null;
  duration_seconds: number | null;
  size_bytes: number | null;
  mime_type: string | null;
  status: string;
  created_at: string;
};

async function probeDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    el.src = url;
    el.onloadedmetadata = () => {
      const d = el.duration;
      URL.revokeObjectURL(url);
      resolve(isFinite(d) ? d : null);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
  });
}

export default function VideoLibrary() {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("none");
  const [uploading, setUploading] = useState<number>(0);
  const [query, setQuery] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const [v, p] = await Promise.all([
      supabase.from("videos").select("*").order("created_at", { ascending: false }),
      supabase.from("projects").select("id, name").order("created_at", { ascending: false }),
    ]);
    setVideos((v.data ?? []) as Video[]);
    setProjects((p.data ?? []) as any);
  };

  useEffect(() => {
    load();
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => ACCEPT.includes(f.type) || /\.(mp4|mov|webm)$/i.test(f.name));
      if (list.length === 0) {
        toast.error("Envie MP4, MOV ou WEBM.");
        return;
      }
      setUploading(list.length);
      let done = 0;
      for (const file of list) {
        try {
          const path = `${crypto.randomUUID()}-${file.name}`;
          const duration = await probeDuration(file);
          const up = await supabase.storage.from(BUCKET).upload(path, file, {
            cacheControl: "3600",
            contentType: file.type || "video/mp4",
            upsert: false,
          });
          if (up.error) throw up.error;
          const { error: insertErr } = await supabase.from("videos").insert({
            project_id: selectedProject === "none" ? null : selectedProject,
            filename: file.name,
            original_path: path,
            duration_seconds: duration ?? undefined,
            size_bytes: file.size,
            mime_type: file.type,
            status: "uploaded" as const,
          });
          if (insertErr) throw insertErr;
          done++;
          setUploading(list.length - done);
        } catch (e: any) {
          toast.error(`Falha em ${file.name}: ${e.message}`);
        }
      }
      setUploading(0);
      toast.success(`${done} vídeo(s) enviado(s).`);
      load();
    },
    [selectedProject]
  );

  const remove = async (v: Video) => {
    if (!confirm(`Excluir "${v.filename}"?`)) return;
    if (v.original_path) {
      await supabase.storage.from(BUCKET).remove([v.original_path]);
    }
    const { error } = await supabase.from("videos").delete().eq("id", v.id);
    if (error) return toast.error(error.message);
    toast.success("Vídeo excluído");
    load();
  };

  const filtered = (videos ?? []).filter((v) =>
    v.filename.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Biblioteca de Vídeos</h1>
        <p className="text-sm text-muted-foreground">
          Envie centenas de vídeos originais (MP4, MOV, WEBM).
        </p>
      </header>

      <Card
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "glass border-dashed transition-all",
          drag ? "border-gold glow-gold" : "border-border/50"
        )}
      >
        <CardContent className="flex flex-col items-center justify-center gap-4 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/10 text-gold">
            <Upload size={22} />
          </div>
          <div>
            <p className="text-sm font-medium">Arraste vídeos aqui ou clique para selecionar</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Suporte a envio em massa · MP4 · MOV · WEBM
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Vincular a projeto (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem projeto</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => inputRef.current?.click()}
              className="bg-gold-gradient text-black"
              disabled={uploading > 0}
            >
              {uploading > 0 ? (
                <>
                  <Loader2 size={14} className="mr-1 animate-spin" /> Enviando... ({uploading} restantes)
                </>
              ) : (
                <>
                  <Upload size={14} className="mr-1" /> Selecionar vídeos
                </>
              )}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar vídeo..."
            className="h-9 w-64 pl-8"
          />
        </div>
        <p className="text-xs text-muted-foreground">{filtered.length} vídeo(s)</p>
      </div>

      {!videos ? (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="glass border-dashed">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Nenhum vídeo encontrado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((v) => (
            <Card key={v.id} className="glass border-border/50 group overflow-hidden">
              <div className="relative aspect-[9/16] bg-black flex items-center justify-center">
                <Film className="text-gold/40" size={32} />
                <button
                  onClick={() => remove(v)}
                  className="absolute right-2 top-2 rounded-md bg-black/70 p-1.5 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
                <Badge
                  variant="outline"
                  className="absolute left-2 top-2 border-gold/30 bg-black/60 text-[10px] text-gold"
                >
                  {v.status}
                </Badge>
              </div>
              <CardContent className="p-3">
                <p className="truncate text-xs font-medium">{v.filename}</p>
                <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{formatDuration(v.duration_seconds)}</span>
                  <span>{formatBytes(v.size_bytes)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
