import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, Trash2, Loader2, Film, Rocket, CheckCircle2, Clock, PlayCircle, CheckSquare, Square, Undo2 } from "lucide-react";
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
  const [confirmMode, setConfirmMode] = useState<null | "all" | "selection">(null);

  const load = async () => {
    if (!activeProject) { setRows([]); return; }
    const { data, error } = await (supabase as any)
      .from("edits")
      .select("*, videos(filename, thumbnail_url), templates(name, preview_url)")
      .eq("project_id", activeProject.id)
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

  const remove = async (id: string) => {
    if (!confirm("Excluir este projeto de edição?")) return;
    const row = rows?.find((r) => r.id === id);
    const { error } = await (supabase as any).from("edits").delete().eq("id", id);
    if (error) return toast.error(error.message);
    // Free the video back to the library if it isn't already completed.
    if (row?.video_id && row.status !== "completed") {
      await (supabase as any)
        .from("videos")
        .update({ status: "uploaded" })
        .eq("id", row.video_id)
        .neq("status", "completed");
    }
    toast.success("Projeto excluído");
    load();
  };

  const returnToLibrary = async (row: EditRow) => {
    if (!row.video_id) {
      toast.error("Este projeto não tem vídeo vinculado.");
      return;
    }
    if (!confirm("Retornar este vídeo para a Biblioteca? O projeto de edição será removido.")) return;
    const { error: vErr } = await (supabase as any)
      .from("videos")
      .update({ status: "uploaded" })
      .eq("id", row.video_id);
    if (vErr) return toast.error(vErr.message);
    const { error: eErr } = await (supabase as any).from("edits").delete().eq("id", row.id);
    if (eErr) return toast.error(eErr.message);
    toast.success("Vídeo devolvido para a Biblioteca");
    load();
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
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-gold"
                        title="Retornar para Biblioteca"
                        onClick={() => returnToLibrary(r)}
                      >
                        <Undo2 size={12} />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(r.id)}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={confirmMode !== null} onOpenChange={(open) => !open && setConfirmMode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmMode === "all" ? "Excluir todos os projetos?" : "Excluir projetos selecionados?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmMode === "all"
                ? "Tem certeza que deseja excluir todos os projetos de edição? Essa ação não poderá ser desfeita."
                : `Tem certeza que deseja excluir ${selected.size} projeto(s) selecionado(s)? Essa ação não poderá ser desfeita.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); runBulkDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Trash2 size={14} className="mr-1.5" />}
              {confirmMode === "all" ? "Excluir todos" : "Excluir selecionados"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
