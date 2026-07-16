import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, Trash2, Loader2, Film, Rocket, CheckCircle2, Clock, PlayCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

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
  const [rows, setRows] = useState<EditRow[] | null>(null);

  const load = async () => {
    const { data, error } = await (supabase as any)
      .from("edits")
      .select("*, videos(filename, thumbnail_url), templates(name, preview_url)")
      .order("updated_at", { ascending: false });
    if (error) { toast.error(error.message); setRows([]); return; }
    setRows((data ?? []) as EditRow[]);
  };

  useEffect(() => { load(); }, []);

  const remove = async (id: string) => {
    if (!confirm("Excluir este projeto de edição?")) return;
    const { error } = await (supabase as any).from("edits").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Projeto excluído");
    load();
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Meus Projetos de Edição</h1>
        <p className="text-sm text-muted-foreground">
          Cada seleção de vídeo + template cria um projeto aqui. Finalize a edição
          para enviar o vídeo para <b>Vídeos Prontos</b>.
        </p>
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
            return (
              <Card key={r.id} className="glass border-border/50 group overflow-hidden">
                <div className="relative aspect-[9/16] bg-black">
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
                        onClick={() => navigate("/processing")}>
                        <Rocket size={12} className="mr-1" /> Ver fila
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 flex-1 text-[11px]"
                        onClick={() => navigate("/finished")}>
                        <CheckCircle2 size={12} className="mr-1" /> Ver pronto
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
    </div>
  );
}
