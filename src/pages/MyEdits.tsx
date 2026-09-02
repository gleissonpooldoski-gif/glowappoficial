import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, Trash2, Loader2, Film, Rocket, CheckCircle2, Clock, PlayCircle, CheckSquare, Square, Undo2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useActiveProject } from "@/context/ProjectContext";
import { useRenderQueue } from "@/context/RenderQueueContext";
import { getProjectModel } from "@/lib/project-model";

const RATIOS: Record<string, { w: number; h: number }> = {
  "9:16": { w: 9, h: 16 },
  "16:9": { w: 16, h: 9 },
  "1:1": { w: 1, h: 1 },
};


type EditRow = {
  id: string;
  name: string | null;
  status: "draft" | "editing" | "processing" | "completed" | "failed";
  aspect_ratio: string | null;
  created_at: string;
  updated_at: string;
  video_id: string | null;
  template_id: string | null;
  videos?: { filename: string; thumbnail_url: string | null } | null;
  templates?: { name: string; preview_url: string | null } | null;
};

const STATUS_META: Record<string, { label: string; icon: any; className: string }> = {
  draft:      { label: "Rascunho",     icon: Pencil,       className: "border-muted-foreground/40 text-muted-foreground" },
  editing:    { label: "Editando",     icon: PlayCircle,   className: "border-blue-400/50 text-blue-300" },
  processing: { label: "Processando",  icon: Loader2,      className: "border-gold/50 text-gold animate-pulse" },
  completed:  { label: "Concluído",    icon: CheckCircle2, className: "border-emerald-400/50 text-emerald-300" },
  failed:     { label: "Falhou",       icon: Clock,        className: "border-destructive/50 text-destructive" },
};

export default function MyEdits() {
  const navigate = useNavigate();
  const { activeProject } = useActiveProject();
  const [rows, setRows] = useState<EditRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmMode, setConfirmMode] = useState<null | "all" | "selection" | "one" | "return">(null);
  const [pendingRow, setPendingRow] = useState<EditRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const { enqueue: enqueueRender } = useRenderQueue();


  const load = async () => {
    if (!activeProject) { setRows([]); return; }
    const { data, error } = await (supabase as any)
      .from("edits")
      .select("*, videos!edits_video_id_fkey(filename, thumbnail_url), templates(name, preview_url)")
      .eq("project_id", activeProject.id)
      .in("status", ["draft", "editing", "failed"])
      .order("updated_at", { ascending: false });
    if (error) { toast.error(error.message); setRows([]); return; }
    setRows((data ?? []) as EditRow[]);
    setSelected(new Set());
  };

  useEffect(() => { load(); }, [activeProject?.id]);

  const allSelected = useMemo(
    () => !!rows && rows.length > 0 && selected.size === rows.length,
    [rows, selected],
  );

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!rows) return;
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  };

  const askRemove = (row: EditRow) => { setPendingRow(row); setConfirmMode("one"); };
  const askReturn = (row: EditRow) => {
    if (!row.video_id) { toast.error("Este projeto não tem vídeo vinculado."); return; }
    setPendingRow(row); setConfirmMode("return");
  };

  const doRemoveOne = async () => {
    if (!pendingRow) return;
    const row = pendingRow;
    setDeleting(true);
    // Optimistic UI.
    const snapshot = rows;
    setRows((prev) => (prev ? prev.filter((r) => r.id !== row.id) : prev));
    try {
      const { error } = await (supabase as any).from("edits").delete().eq("id", row.id);
      if (error) throw error;
      if (row.video_id && row.status !== "completed") {
        await (supabase as any)
          .from("videos")
          .update({ status: "uploaded" })
          .eq("id", row.video_id)
          .neq("status", "completed");
      }
      toast.success("Projeto excluído");
      void load();
    } catch (e: any) {
      setRows(snapshot);
      toast.error(`Falha ao excluir: ${e?.message ?? "erro desconhecido"}`);
    } finally {
      setDeleting(false); setConfirmMode(null); setPendingRow(null);
    }
  };

  const doReturnToLibrary = async () => {
    if (!pendingRow?.video_id) { setConfirmMode(null); setPendingRow(null); return; }
    const row = pendingRow;
    setDeleting(true);
    const snapshot = rows;
    setRows((prev) => (prev ? prev.filter((r) => r.id !== row.id) : prev));
    try {
      const { error: vErr } = await (supabase as any)
        .from("videos").update({ status: "uploaded" }).eq("id", row.video_id);
      if (vErr) throw vErr;
      const { error: eErr } = await (supabase as any).from("edits").delete().eq("id", row.id);
      if (eErr) throw eErr;
      toast.success("Vídeo devolvido para a Biblioteca");
      void load();
    } catch (e: any) {
      setRows(snapshot);
      toast.error(`Falha: ${e?.message ?? "erro desconhecido"}`);
    } finally {
      setDeleting(false); setConfirmMode(null); setPendingRow(null);
    }
  };


  const runBulkDelete = async () => {
    if (!rows) return;
    const ids = confirmMode === "all" ? rows.map((r) => r.id) : Array.from(selected);
    if (ids.length === 0) { setConfirmMode(null); return; }
    setDeleting(true);
    // Free videos of non-completed edits back to the library.
    const videoIds = rows
      .filter((r) => ids.includes(r.id) && r.status !== "completed" && r.video_id)
      .map((r) => r.video_id as string);
    if (videoIds.length) {
      await (supabase as any)
        .from("videos")
        .update({ status: "uploaded" })
        .in("id", videoIds)
        .neq("status", "completed");
    }
    // RLS garante que o usuário só apaga os próprios projetos.
    const { error } = await (supabase as any).from("edits").delete().in("id", ids);
    setDeleting(false);
    setConfirmMode(null);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} projeto(s) excluído(s)`);
    load();
  };

  /** Exporta (envia para a fila de renderização) todos os projetos selecionados. */
  const exportSelected = async () => {
    if (!rows || selected.size === 0 || !activeProject) return;
    setExporting(true);
    let queued = 0;
    let skipped = 0;
    try {
      const model = await getProjectModel(activeProject.id);
      const ids = rows.filter((r) => selected.has(r.id)).map((r) => r.id);

      const { data: edits, error } = await (supabase as any)
        .from("edits")
        .select("*")
        .in("id", ids);
      if (error) throw error;

      for (const e of (edits ?? []) as any[]) {
        try {
          const doc = e.doc && Object.keys(e.doc).length > 0 ? e.doc : model?.doc;
          if (!doc || !e.video_id) { skipped++; continue; }

          const { data: v } = await supabase
            .from("videos").select("*").eq("id", e.video_id).maybeSingle();
          if (!v) { skipped++; continue; }

          let videoUrl: string | null = v.original_url ?? e.video_url ?? null;
          if (v.original_path) {
            const { data: signed } = await supabase.storage
              .from("videos").createSignedUrl(v.original_path, 60 * 60 * 6);
            videoUrl = signed?.signedUrl ?? videoUrl;
          }
          if (!videoUrl) { skipped++; continue; }

          let templateUrl: string | null = e.template_url ?? null;
          let templateFileType: string | null = null;
          const templateId = e.template_id ?? model?.template_id ?? null;
          if (templateId) {
            const { data: tpl } = await (supabase as any)
              .from("templates").select("*").eq("id", templateId).maybeSingle();
            if (tpl) {
              templateFileType = tpl.file_type ?? null;
              if (!templateUrl) {
                const path = tpl.file_path ?? tpl.storage_path ?? tpl.path;
                if (path) {
                  const { data: tSigned } = await supabase.storage
                    .from("templates").createSignedUrl(path, 60 * 60 * 6);
                  templateUrl = tSigned?.signedUrl ?? tpl.preview_url ?? tpl.file_url ?? null;
                } else {
                  templateUrl = tpl.preview_url ?? tpl.file_url ?? null;
                }
              }
            }
          }

          const ratioKey = e.aspect_ratio ?? model?.aspect_ratio ?? "9:16";
          const outRatio = RATIOS[ratioKey] ?? RATIOS["9:16"];
          const px = outRatio.w >= outRatio.h
            ? { width: 1920, height: Math.round((1920 * outRatio.h) / outRatio.w) }
            : { width: Math.round((1920 * outRatio.w) / outRatio.h), height: 1920 };

          const templateKind: "image" | "video" | null =
            templateFileType?.startsWith("video/") ? "video"
            : templateFileType?.startsWith("image/") ? "image"
            : templateUrl ? "image" : null;

          enqueueRender({
            editId: e.id,
            projectId: e.project_id,
            templateId: e.template_id ?? null,
            name: e.name?.trim() || v.filename || "Vídeo sem nome",
            replaceVideoId: e.output_video_id ?? null,
            composition: {
              videoUrl,
              templateUrl,
              templateKind,
              ratio: px,
              videoTransform: doc.video,
              templateOpts: doc.template,
              texts: (doc.texts ?? []) as any,
            },
            videoMeta: {
              filename: v.filename ?? null,
              duration_seconds: v.duration_seconds ?? null,
              thumbnail_path: v.thumbnail_path ?? null,
              thumbnail_url: v.thumbnail_url ?? null,
            },
          });
          queued++;
        } catch (err) {
          console.error("[MyEdits] export failed for edit", e.id, err);
          skipped++;
        }
      }

      if (queued === 0) {
        toast.error("Nenhum projeto pôde ser exportado. Abra o editor e salve o layout antes.");
      } else {
        toast.success(
          `${queued} vídeo(s) enviados para renderização${skipped ? ` — ${skipped} ignorado(s)` : ""}.`,
        );
        setSelected(new Set());
        void load();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao exportar os projetos selecionados.");
    } finally {
      setExporting(false);
    }
  };


  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Meus Projetos de Edição</h1>
          <p className="text-sm text-muted-foreground">
            Cada seleção de vídeo + template cria um projeto aqui. Finalize a edição
            para enviar o vídeo para <b>Vídeos Prontos</b>.
          </p>
        </div>

        {rows && rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={toggleAll}>
              {allSelected ? <CheckSquare size={14} className="mr-1.5" /> : <Square size={14} className="mr-1.5" />}
              {allSelected ? "Limpar seleção" : "Selecionar todos"}
            </Button>
            <Button
              size="sm"
              className="bg-gold-gradient text-black"
              disabled={selected.size === 0 || exporting}
              onClick={exportSelected}
            >
              {exporting ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Upload size={14} className="mr-1.5" />}
              Exportar selecionados ({selected.size})
            </Button>
            <Button

              size="sm"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={selected.size === 0 || deleting}
              onClick={() => setConfirmMode("selection")}
            >
              <Trash2 size={14} className="mr-1.5" />
              Excluir selecionados ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={deleting}
              onClick={() => setConfirmMode("all")}
            >
              <Trash2 size={14} className="mr-1.5" />
              Apagar todos
            </Button>
          </div>
        )}
      </header>

      {!rows ? (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card className="glass border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Film className="text-gold" />
            <p className="text-sm text-muted-foreground">
              Nenhum projeto ainda. Vá até a <b>Biblioteca de Vídeos</b>, selecione
              vídeos e aplique um template para começar.
            </p>
            <Button size="sm" className="mt-2" onClick={() => navigate("/videos")}>
              Ir para a biblioteca
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {rows.map((r) => {
            const meta = STATUS_META[r.status] ?? STATUS_META.draft;
            const Icon = meta.icon;
            const canEdit = r.status === "draft" || r.status === "editing" || r.status === "failed";
            const isSelected = selected.has(r.id);
            return (
              <Card
                key={r.id}
                className={cn(
                  "glass group overflow-hidden transition",
                  isSelected ? "border-gold ring-1 ring-gold/60" : "border-border/50",
                )}
              >
                <div className="relative aspect-[9/16] bg-black">
                  <button
                    type="button"
                    onClick={() => toggleOne(r.id)}
                    className={cn(
                      "absolute right-2 bottom-2 z-10 flex h-7 w-7 items-center justify-center rounded-md border bg-black/70 backdrop-blur transition",
                      isSelected ? "border-gold text-gold" : "border-white/30 text-white/70 hover:text-white",
                    )}
                    title={isSelected ? "Remover da seleção" : "Selecionar"}
                  >
                    {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                  </button>

                  {r.videos?.thumbnail_url ? (
                    <img src={r.videos.thumbnail_url} alt="" className="h-full w-full object-cover opacity-80" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Film className="text-gold/40" size={32} />
                    </div>
                  )}
                  {r.templates?.preview_url && (
                    <img src={r.templates.preview_url} alt=""
                      className="pointer-events-none absolute inset-0 h-full w-full object-cover mix-blend-screen opacity-60" />
                  )}
                  <Badge variant="outline"
                    className={cn("absolute left-2 top-2 bg-black/70 text-[10px]", meta.className)}>
                    <Icon size={10} className={cn("mr-1", r.status === "processing" && "animate-spin")} />
                    {meta.label}
                  </Badge>
                  <Badge variant="outline"
                    className="absolute right-2 top-2 border-gold/40 bg-black/70 text-[10px] text-gold">
                    {r.aspect_ratio ?? "9:16"}
                  </Badge>
                </div>
                <CardContent className="space-y-2 p-3">
                  <p className="truncate text-xs font-medium">{r.name ?? r.videos?.filename ?? "Projeto sem nome"}</p>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{format(new Date(r.updated_at ?? r.created_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                    {r.templates?.name && <span className="text-gold truncate max-w-[60%]">{r.templates.name}</span>}
                  </div>
                  <div className="flex gap-1 pt-1">
                    {canEdit ? (
                      <Button size="sm" className="h-7 flex-1 text-[11px] bg-gold-gradient text-black"
                        onClick={() => navigate(`/editor/${r.id}`)}>
                        <Pencil size={12} className="mr-1" /> Abrir editor
                      </Button>
                    ) : r.status === "processing" ? (
                      <Button size="sm" variant="outline" className="h-7 flex-1 text-[11px]"
                        onClick={() => navigate("/finished")}>
                        <Rocket size={12} className="mr-1" /> Ver renderização
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 flex-1 text-[11px]"
                        onClick={() => navigate("/finished")}>
                        <CheckCircle2 size={12} className="mr-1" /> Ver pronto
                      </Button>
                    )}
                    {r.status !== "completed" && r.status !== "processing" && r.video_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0 border-gold/40 text-gold hover:bg-gold/10"
                        title="Retornar vídeo para Biblioteca"
                        onClick={() => askReturn(r)}
                      >
                        <Undo2 size={12} />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      title="Excluir projeto (mantém o vídeo na Biblioteca)"
                      onClick={() => askRemove(r)}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={confirmMode !== null} onOpenChange={(open) => { if (!open) { setConfirmMode(null); setPendingRow(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmMode === "all" && "Excluir todos os projetos?"}
              {confirmMode === "selection" && "Excluir projetos selecionados?"}
              {confirmMode === "one" && "Tem certeza que deseja excluir este projeto?"}
              {confirmMode === "return" && "Retornar vídeo para a Biblioteca?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmMode === "all" && "Tem certeza que deseja excluir todos os projetos de edição? Os vídeos originais permanecem na Biblioteca. Essa ação não poderá ser desfeita."}
              {confirmMode === "selection" && `Tem certeza que deseja excluir ${selected.size} projeto(s) selecionado(s)? Os vídeos originais permanecem na Biblioteca. Essa ação não poderá ser desfeita.`}
              {confirmMode === "one" && "O projeto de edição será removido, mas o vídeo original permanece salvo na Biblioteca para você criar um novo projeto."}
              {confirmMode === "return" && "Deseja retornar este vídeo para a Biblioteca? O projeto de edição será removido, mas o vídeo permanecerá disponível para criar um novo projeto."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmMode === "one") doRemoveOne();
                else if (confirmMode === "return") doReturnToLibrary();
                else runBulkDelete();
              }}
              disabled={deleting}
              className={cn(
                confirmMode === "return"
                  ? "bg-gold text-black hover:bg-gold/90"
                  : "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              )}
            >
              {deleting ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : (confirmMode === "return" ? <Undo2 size={14} className="mr-1.5" /> : <Trash2 size={14} className="mr-1.5" />)}
              {confirmMode === "all" && "Excluir todos"}
              {confirmMode === "selection" && "Excluir selecionados"}
              {confirmMode === "one" && "Excluir"}
              {confirmMode === "return" && "Retornar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
