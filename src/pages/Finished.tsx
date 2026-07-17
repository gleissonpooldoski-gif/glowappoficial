import { useEffect, useMemo, useState } from "react";
import { Download, Trash2, Film, Package, Play, Calendar, Clock, LayoutTemplate, CheckCircle2, Loader2, AlertCircle, Sparkles, Copy, ChevronDown, ChevronUp, CheckSquare, Square, Instagram, CalendarClock, Layers } from "lucide-react";
import InstagramPublishDialog from "@/components/InstagramPublishDialog";
import InstagramBatchDialog from "@/components/InstagramBatchDialog";
import InstagramBatchScheduleDialog from "@/components/InstagramBatchScheduleDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useActiveProject } from "@/context/ProjectContext";
import { cn } from "@/lib/utils";
import JSZip from "jszip";
import { extractVideoFrames } from "@/lib/videoFrames";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const BUCKET = "videos-processed";

type FinishedVideo = {
  id: string;
  filename: string;
  mime_type: string | null;
  processed_path: string | null;
  processed_url: string | null;
  duration_seconds: number | null;
  size_bytes: number | null;
  template_id: string | null;
  project_id?: string | null;
  created_at: string;
  updated_at: string;
  templateName?: string | null;
  projectName?: string | null;
  projectCategory?: string | null;
};

type RenderJob = {
  id: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  progress: number;
  error: string | null;
  created_at: string;
  edit_id: string | null;
};

type CaptionResult = {
  caption: string;
  hashtags: { alcance: string[]; nicho: string[]; tema: string[] };
};

const formatDuration = (s: number | null) => {
  if (!s || !isFinite(s)) return "—";
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
};

export default function Finished() {
  const { activeProject } = useActiveProject();
  const [videos, setVideos] = useState<FinishedVideo[] | null>(null);
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [captions, setCaptions] = useState<Record<string, CaptionResult>>({});
  const [captionLoading, setCaptionLoading] = useState<Record<string, boolean>>({});
  const [captionOpen, setCaptionOpen] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmMode, setConfirmMode] = useState<null | "all" | "selection" | "one">(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [igDialog, setIgDialog] = useState<{ open: boolean; mode: "now" | "schedule"; videoId: string | null; caption?: string; hashtags?: string; meta?: { filename?: string; templateName?: string | null; projectName?: string | null; projectCategory?: string | null; videoUrl?: string | null } }>({ open: false, mode: "now", videoId: null });
  const [igBatchOpen, setIgBatchOpen] = useState(false);
  const [igBatchScheduleOpen, setIgBatchScheduleOpen] = useState(false);

  const load = async () => {
    if (!activeProject) { setVideos([]); setJobs([]); return; }
    const [{ data: vids, error: vidsErr }, { data: jbs, error: jbsErr }] = await Promise.all([
      supabase
        .from("videos")
        .select("id, filename, mime_type, processed_path, processed_url, duration_seconds, size_bytes, template_id, project_id, created_at, updated_at, status")
        .eq("status", "completed")
        .eq("project_id", activeProject.id)
        .order("updated_at", { ascending: false }),
      (supabase as any)
        .from("render_jobs")
        .select("id, status, progress, error, created_at, edit_id")
        .in("status", ["QUEUED", "PROCESSING", "FAILED"])
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (vidsErr) console.error("[Finished] load videos error", vidsErr);
    if (jbsErr) console.error("[Finished] load jobs error", jbsErr);
    const list = (((vids ?? []) as any[]) as FinishedVideo[]).filter((v) =>
      v.processed_path?.toLowerCase().endsWith(".mp4") &&
      v.filename.toLowerCase().endsWith(".mp4") &&
      (v.mime_type ?? "video/mp4").startsWith("video/mp4"),
    );

    // Enrich with template names
    const templateIds = Array.from(new Set(list.map((v) => v.template_id).filter(Boolean))) as string[];
    if (templateIds.length) {
      const { data: tpls } = await (supabase as any)
        .from("templates").select("id, name").in("id", templateIds);
      const map = new Map((tpls ?? []).map((t: any) => [t.id, t.name]));
      list.forEach((v) => { if (v.template_id) v.templateName = (map.get(v.template_id) as string) ?? null; });
    }
    // Enrich with project name/category
    const projectIds = Array.from(new Set(list.map((v) => v.project_id).filter(Boolean))) as string[];
    if (projectIds.length) {
      const { data: prjs } = await (supabase as any)
        .from("projects").select("id, name, category").in("id", projectIds);
      const map = new Map((prjs ?? []).map((p: any) => [p.id, p]));
      list.forEach((v) => {
        if (v.project_id) {
          const p: any = map.get(v.project_id);
          v.projectName = p?.name ?? null;
          v.projectCategory = p?.category ?? null;
        }
      });
    }

    setVideos(list);
    setJobs(((jbs ?? []) as any[]) as RenderJob[]);

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
    const t = window.setInterval(load, 5000);
    return () => window.clearInterval(t);
  }, [activeProject?.id]);

  const download = async (v: FinishedVideo) => {
    if (!v.processed_path) { toast.info("Arquivo ainda não disponível."); return; }
    if (!v.processed_path.toLowerCase().endsWith(".mp4") || !v.filename.toLowerCase().endsWith(".mp4")) {
      toast.error("Arquivo final MP4 não encontrado para este vídeo."); return;
    }
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(v.processed_path, 60, { download: v.filename });
    if (error) return toast.error(error.message);
    const a = document.createElement("a");
    a.href = data.signedUrl; a.download = v.filename;
    document.body.appendChild(a); a.click(); a.remove();
  };

  const removeMany = async (ids: string[]) => {
    if (!videos || ids.length === 0) return;
    const idSet = new Set(ids);
    const targets = videos.filter((v) => idSet.has(v.id));
    const snapshot = videos;
    // Optimistic UI.
    setVideos((prev) => (prev ? prev.filter((v) => !idSet.has(v.id)) : prev));
    try {
      // Clean up render_jobs (FK is SET NULL, remove explicitly to avoid orphans).
      try {
        await (supabase as any).from("render_jobs").delete().in("video_id", ids);
      } catch (e) {
        console.warn("[Finished] render_jobs cleanup failed", e);
      }
      const { error } = await supabase.from("videos").delete().in("id", ids);
      if (error) throw error;
      const paths = targets.map((v) => v.processed_path).filter(Boolean) as string[];
      if (paths.length) {
        const { error: sErr } = await supabase.storage.from(BUCKET).remove(paths);
        if (sErr) console.warn("[Finished] storage remove failed", sErr);
      }
      toast.success(ids.length === 1 ? "Vídeo excluído" : `${ids.length} vídeos excluídos`);
      setSelected(new Set());
      void load();
    } catch (e: any) {
      setVideos(snapshot);
      toast.error(`Falha ao excluir: ${e?.message ?? "erro desconhecido"}`);
    }
  };


  const askRemoveOne = (id: string) => { setPendingRemoveId(id); setConfirmMode("one"); };

  const runConfirmedDelete = async () => {
    if (!videos) { setConfirmMode(null); return; }
    setBulkBusy(true);
    let ids: string[] = [];
    if (confirmMode === "all") ids = videos.map((v) => v.id);
    else if (confirmMode === "selection") ids = Array.from(selected);
    else if (confirmMode === "one" && pendingRemoveId) ids = [pendingRemoveId];
    await removeMany(ids);
    setBulkBusy(false);
    setConfirmMode(null);
    setPendingRemoveId(null);
  };

  const toggleOne = (id: string) => setSelected((prev) => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const allSelected = useMemo(
    () => !!videos && videos.length > 0 && selected.size === videos.length, [videos, selected]);
  const toggleAll = () => {
    if (!videos) return;
    setSelected(allSelected ? new Set() : new Set(videos.map((v) => v.id)));
  };

  const downloadAll = async () => {
    if (!videos || videos.length === 0) return;
    const targets = selected.size > 0
      ? videos.filter((v) => selected.has(v.id))
      : videos;
    if (targets.length === 0) return;
    if (targets.length === 1) return download(targets[0]);
    setZipBusy(true);
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();
      let done = 0;
      for (const v of targets) {
        if (!v.processed_path) continue;
        const { data, error } = await supabase.storage.from(BUCKET)
          .createSignedUrl(v.processed_path, 60 * 10);
        if (error || !data?.signedUrl) continue;
        const res = await fetch(data.signedUrl);
        if (!res.ok) continue;
        const blob = await res.blob();
        let name = v.filename;
        let i = 1;
        while (usedNames.has(name)) {
          name = v.filename.replace(/\.mp4$/i, `_${i}.mp4`); i++;
        }
        usedNames.add(name);
        zip.file(name, blob);
        done++;
        toast.message(`Preparando ZIP… (${done}/${targets.length})`);
      }
      const out = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(out);
      const a = document.createElement("a");
      const stamp = format(new Date(), "yyyyMMdd-HHmm");
      a.href = url; a.download = `videos-prontos-${stamp}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success(`ZIP com ${done} vídeo(s) baixado`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar ZIP");
    } finally {
      setZipBusy(false);
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const flatHashtags = (c: CaptionResult) =>
    [...c.hashtags.alcance, ...c.hashtags.nicho, ...c.hashtags.tema].join(" ");

  const generateCaption = async (v: FinishedVideo) => {
    setCaptionOpen((s) => ({ ...s, [v.id]: true }));
    setCaptionLoading((s) => ({ ...s, [v.id]: true }));
    try {
      const url = urls[v.id];
      const frames = url ? await extractVideoFrames(url, 4).catch(() => []) : [];
      const { data, error } = await supabase.functions.invoke("generate-caption", {
        body: {
          filename: v.filename,
          templateName: v.templateName ?? null,
          projectName: v.projectName ?? null,
          projectCategory: v.projectCategory ?? null,
          frames,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setCaptions((s) => ({ ...s, [v.id]: data as CaptionResult }));
      if ((data as any)?.validated === false) {
        toast.warning("Legenda gerada, mas não passou 100% na validação. Revise antes de publicar.");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar legenda");
    } finally {
      setCaptionLoading((s) => ({ ...s, [v.id]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vídeos Prontos</h1>
          <p className="text-sm text-muted-foreground">Seus vídeos finalizados. Reproduza, baixe ou exclua.</p>
        </div>
        {videos && videos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={toggleAll}>
              {allSelected ? <CheckSquare size={14} className="mr-1.5" /> : <Square size={14} className="mr-1.5" />}
              {allSelected ? "Limpar seleção" : "Selecionar todos"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-gold/40 text-gold hover:bg-gold/10"
              disabled={selected.size === 0}
              onClick={() => setIgBatchScheduleOpen(true)}
            >
              <CalendarClock size={14} className="mr-1.5" />
              Agendar selecionados ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-gold/40 text-gold hover:bg-gold/10"
              disabled={selected.size === 0}
              onClick={() => setIgBatchOpen(true)}
            >
              <Layers size={14} className="mr-1.5" />
              Publicar em lote ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-gold/40 text-gold hover:bg-gold/10"
              disabled={zipBusy}
              onClick={downloadAll}
            >
              {zipBusy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Package size={14} className="mr-1.5" />}
              {selected.size > 0 ? `Baixar selecionados (${selected.size})` : "Baixar todos"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={selected.size === 0 || bulkBusy}
              onClick={() => setConfirmMode("selection")}
            >
              <Trash2 size={14} className="mr-1.5" />
              Excluir selecionados ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={bulkBusy}
              onClick={() => setConfirmMode("all")}
            >
              <Trash2 size={14} className="mr-1.5" />
              Excluir todos
            </Button>
          </div>
        )}
      </header>


      {jobs.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Renderizações em andamento</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {jobs.map((j) => (
              <Card key={j.id} className="glass border-border/50">
                <CardContent className="flex items-center gap-3 p-3">
                  {j.status === "FAILED" ? (
                    <AlertCircle className="text-destructive" size={18} />
                  ) : (
                    <Loader2 className="animate-spin text-gold" size={18} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">
                        {j.status === "QUEUED" && "Na fila"}
                        {j.status === "PROCESSING" && "Renderizando…"}
                        {j.status === "FAILED" && "Falhou"}
                      </span>
                      <span className="text-muted-foreground">{j.progress ?? 0}%</span>
                    </div>
                    <Progress value={j.progress ?? (j.status === "QUEUED" ? 5 : 40)} className="mt-1 h-1.5" />
                    {j.error && <p className="mt-1 text-[10px] text-destructive">{j.error}</p>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {!videos ? (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-72" />)}
        </div>
      ) : videos.length === 0 ? (
        <Card className="glass border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Film className="text-gold" />
            <p className="text-sm text-muted-foreground">
              Nenhum vídeo finalizado. Abra um projeto no editor e clique em <b>Exportar vídeo</b>.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {videos.map((v) => {
            const src = urls[v.id];
            const cap = captions[v.id];
            const loading = !!captionLoading[v.id];
            const open = !!captionOpen[v.id];
            const isSelected = selected.has(v.id);
            return (
              <Card key={v.id} className={cn(
                "glass group overflow-hidden",
                isSelected ? "border-gold ring-1 ring-gold/60" : "border-border/50",
              )}>
                <div className="relative aspect-[9/16] bg-black">
                  {src ? (
                    <video src={src} controls preload="metadata" className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Play className="text-gold/40" size={32} />
                    </div>
                  )}
                  <Badge className="absolute left-2 top-2 border-emerald-400/40 bg-black/70 text-[10px] text-emerald-300" variant="outline">
                    <CheckCircle2 size={10} className="mr-1" /> Concluído
                  </Badge>
                  <button
                    type="button"
                    onClick={() => toggleOne(v.id)}
                    className={cn(
                      "absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md border bg-black/70 backdrop-blur",
                      isSelected ? "border-gold text-gold" : "border-white/30 text-white/70 hover:text-white",
                    )}
                    title={isSelected ? "Remover da seleção" : "Selecionar"}
                  >
                    {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                  </button>
                </div>
                <CardContent className="p-3">
                  <p className="truncate text-xs font-medium" title={v.filename}>{v.filename}</p>
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
                    {v.templateName && (
                      <div className="flex items-center gap-1.5 text-gold">
                        <LayoutTemplate size={10} /> {v.templateName}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Button size="sm" className="h-7 flex-1 bg-gold-gradient text-[11px] text-black" onClick={() => download(v)}>
                      <Download size={12} className="mr-1" /> Baixar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => askRemoveOne(v.id)}>
                      <Trash2 size={12} />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 flex-1 text-[11px] border-gold/40 text-gold hover:bg-gold/10"
                      onClick={() => setIgDialog({ open: true, mode: "now", videoId: v.id, caption: cap?.caption, hashtags: cap ? flatHashtags(cap) : "", meta: { filename: v.filename, templateName: v.templateName ?? null, projectName: v.projectName ?? null, projectCategory: v.projectCategory ?? null, videoUrl: urls[v.id] ?? null } })}
                    >
                      <Instagram size={12} className="mr-1" /> Publicar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 flex-1 text-[11px]"
                      onClick={() => setIgDialog({ open: true, mode: "schedule", videoId: v.id, caption: cap?.caption, hashtags: cap ? flatHashtags(cap) : "", meta: { filename: v.filename, templateName: v.templateName ?? null, projectName: v.projectName ?? null, projectCategory: v.projectCategory ?? null } })}
                    >
                      <CalendarClock size={12} className="mr-1" /> Agendar
                    </Button>
                  </div>



                  {/* Legenda e Hashtags */}
                  <div className="mt-3 border-t border-border/50 pt-2">
                    <button
                      type="button"
                      onClick={() => setCaptionOpen((s) => ({ ...s, [v.id]: !open }))}
                      className="flex w-full items-center justify-between text-[11px] font-medium text-muted-foreground hover:text-gold"
                    >
                      <span className="flex items-center gap-1.5">
                        <Sparkles size={12} className="text-gold" /> Legenda e Hashtags
                      </span>
                      {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>

                    {open && (
                      <div className="mt-2 space-y-2">
                        {!cap && !loading && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-full text-[11px] border-gold/40 text-gold hover:bg-gold/10"
                            onClick={() => generateCaption(v)}
                          >
                            <Sparkles size={12} className="mr-1" /> Gerar com IA
                          </Button>
                        )}

                        {loading && (
                          <div className="flex items-center justify-center gap-2 py-3 text-[11px] text-muted-foreground">
                            <Loader2 size={12} className="animate-spin" /> Gerando…
                          </div>
                        )}

                        {cap && !loading && (
                          <div className="space-y-2">
                            <div className="rounded-md border border-border/50 bg-background/40 p-2">
                              <p className="text-[11px] leading-snug whitespace-pre-wrap">{cap.caption}</p>
                            </div>
                            <div className="rounded-md border border-border/50 bg-background/40 p-2 space-y-1">
                              {cap.hashtags.alcance.length > 0 && (
                                <p className="text-[10px] leading-snug"><span className="text-muted-foreground">Alcance: </span>{cap.hashtags.alcance.join(" ")}</p>
                              )}
                              {cap.hashtags.nicho.length > 0 && (
                                <p className="text-[10px] leading-snug"><span className="text-muted-foreground">Nicho: </span>{cap.hashtags.nicho.join(" ")}</p>
                              )}
                              {cap.hashtags.tema.length > 0 && (
                                <p className="text-[10px] leading-snug"><span className="text-muted-foreground">Tema: </span>{cap.hashtags.tema.join(" ")}</p>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <Button size="sm" variant="outline" className="h-6 flex-1 text-[10px]"
                                onClick={() => copyText(cap.caption, "Legenda")}>
                                <Copy size={10} className="mr-1" /> Copiar legenda
                              </Button>
                              <Button size="sm" variant="outline" className="h-6 flex-1 text-[10px]"
                                onClick={() => copyText(flatHashtags(cap), "Hashtags")}>
                                <Copy size={10} className="mr-1" /> Copiar hashtags
                              </Button>
                              <Button size="sm" className="h-6 flex-1 bg-gold-gradient text-[10px] text-black"
                                onClick={() => copyText(`${cap.caption}\n\n${flatHashtags(cap)}`, "Legenda + hashtags")}>
                                <Copy size={10} className="mr-1" /> Copiar tudo
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 w-full text-[10px] text-muted-foreground hover:text-gold"
                                onClick={() => generateCaption(v)}>
                                <Sparkles size={10} className="mr-1" /> Gerar novamente
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={confirmMode !== null} onOpenChange={(o) => { if (!o) { setConfirmMode(null); setPendingRemoveId(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmMode === "all"
                ? "Excluir todos os vídeos prontos?"
                : confirmMode === "selection"
                ? "Excluir vídeos selecionados?"
                : "Excluir este vídeo?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmMode === "all"
                ? "Tem certeza que deseja excluir todos os vídeos prontos? Os arquivos serão removidos do armazenamento e essa ação não poderá ser desfeita."
                : confirmMode === "selection"
                ? `Tem certeza que deseja excluir ${selected.size} vídeo(s) selecionado(s)? Os arquivos serão removidos do armazenamento.`
                : "O arquivo será removido do armazenamento e essa ação não poderá ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); runConfirmedDelete(); }}
              disabled={bulkBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkBusy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Trash2 size={14} className="mr-1.5" />}
              {confirmMode === "all" ? "Excluir todos" : confirmMode === "selection" ? "Excluir selecionados" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <InstagramPublishDialog
        open={igDialog.open}
        onOpenChange={(o) => setIgDialog((s) => ({ ...s, open: o }))}
        mode={igDialog.mode}
        videoId={igDialog.videoId}
        defaultCaption={igDialog.caption ?? ""}
        defaultHashtags={igDialog.hashtags ?? ""}
        videoMeta={igDialog.meta}
        onDone={() => load()}
      />
      <InstagramBatchDialog
        open={igBatchOpen}
        onOpenChange={setIgBatchOpen}
        videoIds={Array.from(selected)}
        onDone={() => { setSelected(new Set()); load(); }}
      />
      <InstagramBatchScheduleDialog
        open={igBatchScheduleOpen}
        onOpenChange={setIgBatchScheduleOpen}
        videos={(videos ?? []).filter((v) => selected.has(v.id)).map((v) => ({
          id: v.id,
          filename: v.filename,
          templateName: v.templateName ?? null,
          projectName: v.projectName ?? null,
          projectCategory: v.projectCategory ?? null,
        }))}
        onDone={() => { setSelected(new Set()); load(); }}
      />
    </div>
  );
}

