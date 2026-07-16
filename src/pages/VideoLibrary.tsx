import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Film,
  Upload,
  Trash2,
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import {
  BUCKET,
  CONCURRENCY,
  QueueItem,
  processItem,
  validateFile,
} from "@/lib/uploadQueue";

type Video = {
  id: string;
  project_id: string | null;
  filename: string;
  original_path: string | null;
  thumbnail_path: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  size_bytes: number | null;
  mime_type: string | null;
  status: string;
  created_at: string;
};

export default function VideoLibrary() {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("none");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [query, setQuery] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<QueueItem[]>([]);
  const activeCount = useRef(0);
  const projectRef = useRef<string>("none");

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  useEffect(() => {
    projectRef.current = selectedProject;
  }, [selectedProject]);

  const load = async () => {
    const [v, p] = await Promise.all([
      supabase.from("videos").select("*").order("created_at", { ascending: false }),
      supabase.from("projects").select("id, name").order("created_at", { ascending: false }),
    ]);
    const list = (v.data ?? []) as Video[];
    setVideos(list);
    setProjects((p.data ?? []) as any);

    // Sign thumbnails for private bucket
    const toSign = list.filter((x) => x.thumbnail_path).map((x) => x.thumbnail_path!) as string[];
    if (toSign.length) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(toSign, 60 * 60 * 24 * 7);
      const map: Record<string, string> = {};
      data?.forEach((d, i) => {
        if (d.signedUrl) map[toSign[i]] = d.signedUrl;
      });
      setThumbs(map);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue((q) => q.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const runNext = useCallback(async () => {
    while (activeCount.current < CONCURRENCY) {
      const next = queueRef.current.find((i) => i.status === "pending");
      if (!next) return;
      activeCount.current++;
      updateItem(next.id, { status: "uploading", progress: 0, error: undefined });

      const projectId = projectRef.current === "none" ? null : projectRef.current;
      processItem(
        next,
        projectId,
        (pct) => updateItem(next.id, { progress: pct }),
        (xhr) => updateItem(next.id, { xhr })
      )
        .then((res) => {
          updateItem(next.id, {
            status: "completed",
            progress: 100,
            videoId: res.videoId,
            thumbnailUrl: res.thumbnailUrl,
            durationSeconds: res.duration,
          });
        })
        .catch((err: Error) => {
          updateItem(next.id, { status: "failed", error: err.message });
        })
        .finally(() => {
          activeCount.current--;
          runNext();
          load();
        });
    }
  }, [updateItem]);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      const newItems: QueueItem[] = [];
      let rejected = 0;
      for (const file of arr) {
        const err = validateFile(file);
        if (err) {
          rejected++;
          newItems.push({
            id: crypto.randomUUID(),
            file,
            status: "failed",
            progress: 0,
            error: err,
          });
        } else {
          newItems.push({
            id: crypto.randomUUID(),
            file,
            status: "pending",
            progress: 0,
          });
        }
      }
      if (newItems.length === 0) return;
      setQueue((q) => [...newItems, ...q]);
      if (rejected > 0) toast.error(`${rejected} arquivo(s) rejeitado(s)`);
      setTimeout(() => runNext(), 0);
    },
    [runNext]
  );

  const retryItem = useCallback(
    (id: string) => {
      setQueue((q) =>
        q.map((it) => (it.id === id ? { ...it, status: "pending", progress: 0, error: undefined } : it))
      );
      setTimeout(() => runNext(), 0);
    },
    [runNext]
  );

  const cancelItem = useCallback((id: string) => {
    setQueue((q) => {
      const it = q.find((x) => x.id === id);
      if (it?.xhr && it.status === "uploading") it.xhr.abort();
      return q.filter((x) => x.id !== id);
    });
  }, []);

  const clearFinished = () =>
    setQueue((q) => q.filter((it) => it.status === "pending" || it.status === "uploading"));

  const remove = async (v: Video) => {
    if (!confirm(`Excluir "${v.filename}"?`)) return;
    const paths = [v.original_path, v.thumbnail_path].filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    const { error } = await supabase.from("videos").delete().eq("id", v.id);
    if (error) return toast.error(error.message);
    toast.success("Vídeo excluído");
    load();
  };

  const filtered = (videos ?? []).filter((v) =>
    v.filename.toLowerCase().includes(query.toLowerCase())
  );

  const stats = useMemo(() => {
    const pending = queue.filter((i) => i.status === "pending").length;
    const uploading = queue.filter((i) => i.status === "uploading").length;
    const completed = queue.filter((i) => i.status === "completed").length;
    const failed = queue.filter((i) => i.status === "failed").length;
    return { pending, uploading, completed, failed, total: queue.length };
  }, [queue]);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Biblioteca de Vídeos</h1>
        <p className="text-sm text-muted-foreground">
          Envio em massa com fila inteligente · MP4, MOV, WEBM · até 2GB por arquivo
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
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
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
              Envie centenas de arquivos · fila com {CONCURRENCY} uploads simultâneos
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
            >
              <Upload size={14} className="mr-1" /> Selecionar vídeos
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </CardContent>
      </Card>

      {queue.length > 0 && (
        <Card className="glass border-border/50">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs">
                <span className="font-medium">Fila de upload</span>
                <span className="text-muted-foreground">
                  {stats.completed}/{stats.total} concluídos
                </span>
                {stats.uploading > 0 && (
                  <Badge variant="outline" className="border-gold/40 text-gold">
                    <Loader2 size={10} className="mr-1 animate-spin" /> {stats.uploading} enviando
                  </Badge>
                )}
                {stats.pending > 0 && (
                  <Badge variant="outline">{stats.pending} aguardando</Badge>
                )}
                {stats.failed > 0 && (
                  <Badge variant="destructive">{stats.failed} com erro</Badge>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={clearFinished}>
                Limpar concluídos
              </Button>
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {queue.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center gap-3 rounded-md border border-border/40 bg-background/40 px-3 py-2"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
                    {it.status === "completed" ? (
                      <CheckCircle2 size={16} className="text-emerald-500" />
                    ) : it.status === "failed" ? (
                      <XCircle size={16} className="text-destructive" />
                    ) : it.status === "uploading" ? (
                      <Loader2 size={16} className="animate-spin text-gold" />
                    ) : (
                      <Clock size={16} className="text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-medium">{it.file.name}</p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatBytes(it.file.size)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <Progress value={it.progress} className="h-1.5 flex-1" />
                      <span className="w-10 text-right text-[10px] text-muted-foreground">
                        {it.status === "completed" ? "100%" : `${it.progress}%`}
                      </span>
                    </div>
                    {it.error && (
                      <p className="mt-1 text-[10px] text-destructive">{it.error}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {it.status === "failed" && (
                      <Button size="icon" variant="ghost" onClick={() => retryItem(it.id)}>
                        <RotateCw size={13} />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => cancelItem(it.id)}>
                      <X size={13} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
          {filtered.map((v) => {
            const thumb = v.thumbnail_path ? thumbs[v.thumbnail_path] : v.thumbnail_url;
            return (
              <Card key={v.id} className="glass border-border/50 group overflow-hidden">
                <div className="relative aspect-[9/16] flex items-center justify-center bg-black">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={v.filename}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <Film className="text-gold/40" size={32} />
                  )}
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
            );
          })}
        </div>
      )}
    </div>
  );
}
