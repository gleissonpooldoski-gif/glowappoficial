import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  Play,
  Ban,
  Download,
  Wand2,
  Rocket,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  DuplicateVideoError,
  QueueItem,
  computeFileHash,
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
  file_hash: string | null;
  status: string;
  created_at: string;
};

type PendingDelete =
  | { kind: "selected"; ids: string[]; step: 1 }
  | { kind: "all"; ids: string[]; step: 1 | 2 }
  | { kind: "project"; ids: string[]; projectName: string; step: 1 };

export default function VideoLibrary() {
  const navigate = useNavigate();
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string; preview_url: string | null }[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("none");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [query, setQuery] = useState("");
  const [drag, setDrag] = useState(false);
  const [playing, setPlaying] = useState<{ video: Video; url: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [chosenTemplate, setChosenTemplate] = useState<string>("");
  const [applying, setApplying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<QueueItem[]>([]);
  const activeCount = useRef(0);
  const projectRef = useRef<string>("none");
  const seenHashes = useRef<Set<string>>(new Set());

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  useEffect(() => {
    projectRef.current = selectedProject;
  }, [selectedProject]);

  const load = async () => {
    const [v, p, t] = await Promise.all([
      supabase.from("videos").select("*").order("created_at", { ascending: false }),
      supabase.from("projects").select("id, name").order("created_at", { ascending: false }),
      supabase.from("templates").select("id, name, preview_url").order("created_at", { ascending: false }),
    ]);
    const list = (v.data ?? []) as Video[];
    setVideos(list);
    setProjects((p.data ?? []) as any);
    setTemplates((t.data ?? []) as any);
    seenHashes.current = new Set(list.map((x) => x.file_hash).filter(Boolean) as string[]);

    const toSign = list.filter((x) => x.thumbnail_path).map((x) => x.thumbnail_path!) as string[];
    if (toSign.length) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(toSign, 60 * 60 * 24 * 7);
      const map: Record<string, string> = {};
      data?.forEach((d, i) => {
        if (d.signedUrl) map[toSign[i]] = d.signedUrl;
      });
      setThumbs(map);
    }
    // Drop selection for videos that no longer exist
    setSelected((prev) => {
      const alive = new Set(list.map((x) => x.id));
      const next = new Set<string>();
      prev.forEach((id) => alive.has(id) && next.add(id));
      return next;
    });
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
        (xhr) => updateItem(next.id, { xhr }),
        (hash) => updateItem(next.id, { fileHash: hash })
      )
        .then((res) => {
          seenHashes.current.add(res.fileHash);
          updateItem(next.id, {
            status: "completed",
            progress: 100,
            videoId: res.videoId,
            thumbnailUrl: res.thumbnailUrl,
            durationSeconds: res.duration,
            fileHash: res.fileHash,
          });
        })
        .catch((err: Error) => {
          if (err instanceof DuplicateVideoError) {
            toast.warning(`${next.file.name}: já foi enviado`);
            updateItem(next.id, { status: "duplicate", error: err.message });
          } else {
            updateItem(next.id, { status: "failed", error: err.message });
          }
        })
        .finally(() => {
          activeCount.current--;
          runNext();
          load();
        });
    }
  }, [updateItem]);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      const newItems: QueueItem[] = [];
      const localHashes = new Set<string>();
      let rejected = 0;
      let dupes = 0;

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
          continue;
        }
        let hash: string | undefined;
        try {
          hash = await computeFileHash(file);
        } catch {
          hash = undefined;
        }
        if (hash && (seenHashes.current.has(hash) || localHashes.has(hash))) {
          dupes++;
          newItems.push({
            id: crypto.randomUUID(),
            file,
            status: "duplicate",
            progress: 0,
            fileHash: hash,
            error: "Este vídeo já foi enviado.",
          });
          continue;
        }
        if (hash) localHashes.add(hash);
        newItems.push({
          id: crypto.randomUUID(),
          file,
          status: "pending",
          progress: 0,
          fileHash: hash,
        });
      }
      if (newItems.length === 0) return;
      setQueue((q) => [...newItems, ...q]);
      if (rejected > 0) toast.error(`${rejected} arquivo(s) rejeitado(s)`);
      if (dupes > 0) toast.warning(`${dupes} vídeo(s) duplicado(s) ignorado(s)`);
      setTimeout(() => runNext(), 0);
    },
    [runNext]
  );

  const retryItem = useCallback(
    (id: string) => {
      setQueue((q) =>
        q.map((it) =>
          it.id === id ? { ...it, status: "pending", progress: 0, error: undefined } : it
        )
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

  const openPlayer = async (v: Video) => {
    if (!v.original_path) {
      toast.error("Arquivo original não disponível");
      return;
    }
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(v.original_path, 60 * 60);
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível carregar o vídeo");
      return;
    }
    setPlaying({ video: v, url: data.signedUrl });
  };

  const filtered = useMemo(() => {
    const all = videos ?? [];
    return all.filter((v) => {
      if (filterProject === "all") {
      } else if (filterProject === "none") {
        if (v.project_id) return false;
      } else if (v.project_id !== filterProject) return false;
      if (query && !v.filename.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [videos, query, filterProject]);

  const allVisibleSelected = filtered.length > 0 && filtered.every((v) => selected.has(v.id));
  const someVisibleSelected = filtered.some((v) => selected.has(v.id));

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((v) => next.delete(v.id));
      else filtered.forEach((v) => next.add(v.id));
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  const deleteVideosByIds = async (ids: string[]) => {
    if (ids.length === 0) return;
    setDeleting(true);
    try {
      const targets = (videos ?? []).filter((v) => ids.includes(v.id));
      const paths = targets
        .flatMap((v) => [v.original_path, v.thumbnail_path])
        .filter(Boolean) as string[];
      // Storage cleanup in chunks (API limit friendly)
      const chunk = 100;
      for (let i = 0; i < paths.length; i += chunk) {
        await supabase.storage.from(BUCKET).remove(paths.slice(i, i + chunk));
      }
      // DB delete in chunks
      for (let i = 0; i < ids.length; i += chunk) {
        const slice = ids.slice(i, i + chunk);
        const { error } = await supabase.from("videos").delete().in("id", slice);
        if (error) throw error;
      }
      targets.forEach((v) => v.file_hash && seenHashes.current.delete(v.file_hash));
      toast.success(`${ids.length} vídeo(s) excluído(s)`);
      setSelected(new Set());
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao excluir");
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  const downloadSelected = async () => {
    if (selected.size === 0) return;
    setDownloading(true);
    try {
      const targets = (videos ?? []).filter((v) => selected.has(v.id) && v.original_path);
      for (const v of targets) {
        const { data } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(v.original_path!, 60 * 30, { download: v.filename });
        if (data?.signedUrl) {
          const a = document.createElement("a");
          a.href = data.signedUrl;
          a.download = v.filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          await new Promise((r) => setTimeout(r, 250));
        }
      }
      toast.success(`${targets.length} download(s) iniciado(s)`);
    } finally {
      setDownloading(false);
    }
  };

  const applyTemplate = async () => {
    if (!chosenTemplate || selected.size === 0) return;
    setApplying(true);
    try {
      const ids = Array.from(selected);
      const byId = new Map((videos ?? []).map((v) => [v.id, v] as const));
      const rows = ids.map((vid) => {
        const v = byId.get(vid);
        return {
          video_id: vid,
          template_id: chosenTemplate,
          project_id: v?.project_id ?? null,
          status: "pending" as const,
          progress: 0,
          options: { captions: true, logo: true, music: false, effects: true },
        };
      });
      const chunk = 200;
      for (let i = 0; i < rows.length; i += chunk) {
        const { error } = await supabase
          .from("processing_queue")
          .insert(rows.slice(i, i + chunk));
        if (error) throw error;
      }
      for (let i = 0; i < ids.length; i += chunk) {
        await supabase
          .from("videos")
          .update({ status: "queued" as const })
          .in("id", ids.slice(i, i + chunk));
      }
      toast.success(`${rows.length} vídeo(s) enviados para a fila`);
      setApplyOpen(false);
      setChosenTemplate("");
      setSelected(new Set());
      navigate("/processing");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao aplicar template");
    } finally {
      setApplying(false);
    }
  };


  const requestDeleteSelected = () => {
    if (selected.size === 0) return;
    setPendingDelete({ kind: "selected", ids: Array.from(selected), step: 1 });
  };
  const requestDeleteAll = () => {
    const ids = (videos ?? []).map((v) => v.id);
    if (ids.length === 0) return;
    setPendingDelete({ kind: "all", ids, step: 1 });
  };
  const requestDeleteProject = () => {
    if (filterProject === "all") return;
    const ids = (videos ?? [])
      .filter((v) =>
        filterProject === "none" ? !v.project_id : v.project_id === filterProject
      )
      .map((v) => v.id);
    if (ids.length === 0) return;
    const name =
      filterProject === "none"
        ? "Sem projeto"
        : projects.find((p) => p.id === filterProject)?.name ?? "projeto";
    setPendingDelete({ kind: "project", ids, projectName: name, step: 1 });
  };

  const confirmDialogTitle = !pendingDelete
    ? ""
    : pendingDelete.kind === "selected"
    ? "Apagar vídeos selecionados?"
    : pendingDelete.kind === "project"
    ? `Apagar todos os vídeos de "${pendingDelete.projectName}"?`
    : pendingDelete.step === 1
    ? "Apagar TODOS os vídeos?"
    : "Confirmação final";

  const confirmDialogDesc = !pendingDelete
    ? ""
    : pendingDelete.kind === "all" && pendingDelete.step === 2
    ? "Esta ação não pode ser desfeita. Todos os vídeos serão removidos permanentemente do banco e do armazenamento."
    : `Tem certeza que deseja apagar ${pendingDelete.ids.length} vídeo(s)? Os arquivos e miniaturas serão removidos do armazenamento.`;

  const stats = useMemo(() => {
    const pending = queue.filter((i) => i.status === "pending").length;
    const uploading = queue.filter((i) => i.status === "uploading").length;
    const completed = queue.filter((i) => i.status === "completed").length;
    const failed = queue.filter((i) => i.status === "failed").length;
    const duplicate = queue.filter((i) => i.status === "duplicate").length;
    return { pending, uploading, completed, failed, duplicate, total: queue.length };
  }, [queue]);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Biblioteca de Vídeos</h1>
        <p className="text-sm text-muted-foreground">
          Envio em massa · seleção múltipla · exclusão em lote · até 2GB por arquivo
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
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="font-medium">Fila de upload</span>
                <span className="text-muted-foreground">
                  {stats.completed}/{stats.total} concluídos
                </span>
                {stats.uploading > 0 && (
                  <Badge variant="outline" className="border-gold/40 text-gold">
                    <Loader2 size={10} className="mr-1 animate-spin" /> {stats.uploading} enviando
                  </Badge>
                )}
                {stats.pending > 0 && <Badge variant="outline">{stats.pending} aguardando</Badge>}
                {stats.duplicate > 0 && (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-500">
                    {stats.duplicate} duplicado(s)
                  </Badge>
                )}
                {stats.failed > 0 && <Badge variant="destructive">{stats.failed} com erro</Badge>}
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
                    ) : it.status === "duplicate" ? (
                      <Ban size={16} className="text-amber-500" />
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
                      <p
                        className={cn(
                          "mt-1 text-[10px]",
                          it.status === "duplicate" ? "text-amber-500" : "text-destructive"
                        )}
                      >
                        {it.error}
                      </p>
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

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar vídeo..."
            className="h-9 w-64 pl-8"
          />
        </div>
        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="h-9 w-48">
            <SelectValue placeholder="Filtrar por projeto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os projetos</SelectItem>
            <SelectItem value="none">Sem projeto</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border/50 px-3 text-xs">
          <Checkbox
            checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
            onCheckedChange={toggleAllVisible}
          />
          Selecionar todos
        </label>
        <div className="ml-auto flex items-center gap-2">
          {filterProject !== "all" && (
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:text-destructive"
              onClick={requestDeleteProject}
            >
              <Trash2 size={13} className="mr-1" /> Apagar do projeto
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/40 text-destructive hover:text-destructive"
            onClick={requestDeleteAll}
            disabled={(videos ?? []).length === 0}
          >
            <Trash2 size={13} className="mr-1" /> Apagar todos
          </Button>
          <p className="text-xs text-muted-foreground">{filtered.length} vídeo(s)</p>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold/30 bg-background/95 px-4 py-2 backdrop-blur">
          <span className="text-xs font-medium">
            <span className="text-gold">{selected.size}</span> vídeo(s) selecionado(s)
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setApplyOpen(true)}
              className="bg-gold-gradient text-black glow-gold"
            >
              <Wand2 size={13} className="mr-1" /> Aplicar template
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={downloadSelected}
              disabled={downloading}
            >
              {downloading ? (
                <Loader2 size={13} className="mr-1 animate-spin" />
              ) : (
                <Download size={13} className="mr-1" />
              )}
              Baixar selecionados
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={requestDeleteSelected}
              disabled={deleting}
            >
              <Trash2 size={13} className="mr-1" /> Apagar selecionados
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              Cancelar seleção
            </Button>
          </div>
        </div>
      )}

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
            const isSelected = selected.has(v.id);
            return (
              <Card
                key={v.id}
                className={cn(
                  "glass group overflow-hidden transition",
                  isSelected ? "border-gold ring-1 ring-gold/40" : "border-border/50"
                )}
              >
                <div className="relative aspect-[9/16] w-full bg-black">
                  <button
                    type="button"
                    onClick={() => openPlayer(v)}
                    className="absolute inset-0 flex items-center justify-center"
                  >
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
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                      <span className="flex items-center gap-1 rounded-full bg-gold px-3 py-1.5 text-xs font-medium text-black">
                        <Play size={12} /> Assistir
                      </span>
                    </span>
                  </button>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleOne(v.id);
                    }}
                    className={cn(
                      "absolute left-2 top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border transition",
                      isSelected
                        ? "border-gold bg-gold text-black"
                        : "border-border/60 bg-black/70 text-transparent opacity-0 group-hover:opacity-100"
                    )}
                  >
                    <CheckCircle2 size={14} />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete({ kind: "selected", ids: [v.id], step: 1 });
                    }}
                    className="absolute right-2 top-2 rounded-md bg-black/70 p-1.5 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
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

      {/* Player modal */}
      <Dialog open={!!playing} onOpenChange={(o) => !o && setPlaying(null)}>
        <DialogContent className="max-w-3xl bg-black p-0 border-border/50">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle className="text-sm truncate pr-6">
              {playing?.video.filename}
            </DialogTitle>
          </DialogHeader>
          {playing && (
            <div className="p-4 pt-2">
              <video
                key={playing.url}
                src={playing.url}
                controls
                autoPlay
                className="w-full max-h-[70vh] rounded-md bg-black"
              >
                Seu navegador não suporta vídeo HTML5.
              </video>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{formatDuration(playing.video.duration_seconds)}</span>
                <span>{formatBytes(playing.video.size_bytes)}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Apply template dialog */}
      <Dialog open={applyOpen} onOpenChange={(o) => !applying && setApplyOpen(o)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Aplicar template a {selected.size} vídeo(s)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Cada vídeo selecionado gera uma renderização independente usando o
              mesmo template.
            </p>
            {templates.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/50 p-6 text-center text-xs text-muted-foreground">
                Nenhum template criado ainda.{" "}
                <button
                  className="text-gold underline"
                  onClick={() => navigate("/templates")}
                >
                  Criar template
                </button>
              </div>
            ) : (
              <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {templates.map((t) => {
                  const active = chosenTemplate === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setChosenTemplate(t.id)}
                      className={cn(
                        "flex flex-col overflow-hidden rounded-md border text-left transition",
                        active
                          ? "border-gold ring-1 ring-gold/40"
                          : "border-border/50 hover:border-gold/40"
                      )}
                    >
                      <div className="aspect-[9/16] w-full bg-black">
                        {t.preview_url ? (
                          <img
                            src={t.preview_url}
                            alt={t.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-gold/30">
                            <Film size={28} />
                          </div>
                        )}
                      </div>
                      <div className="truncate px-2 py-1.5 text-xs">{t.name}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setApplyOpen(false)}
              disabled={applying}
            >
              Cancelar
            </Button>
            <Button
              onClick={applyTemplate}
              disabled={!chosenTemplate || applying}
              className="bg-gold-gradient text-black"
            >
              {applying ? (
                <Loader2 size={14} className="mr-1 animate-spin" />
              ) : (
                <Rocket size={14} className="mr-1" />
              )}
              Gerar {selected.size} vídeo(s)
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* Delete confirmation */}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && !deleting && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialogDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (!pendingDelete) return;
                if (pendingDelete.kind === "all" && pendingDelete.step === 1) {
                  setPendingDelete({ ...pendingDelete, step: 2 });
                  return;
                }
                deleteVideosByIds(pendingDelete.ids);
              }}
            >
              {deleting ? (
                <>
                  <Loader2 size={13} className="mr-1 animate-spin" /> Excluindo...
                </>
              ) : pendingDelete?.kind === "all" && pendingDelete.step === 1 ? (
                "Continuar"
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
