import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, Image as ImageIcon, Check, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type ChangeTemplateResult = {
  template: any;
  url: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null | undefined;
  currentTemplateId?: string | null;
  onApply: (result: ChangeTemplateResult) => void | Promise<void>;
};

const CATEGORIES = ["Geral", "Intro", "Outro", "Overlay", "Transição", "Legenda", "Chamada", "Vinheta"];

export default function ChangeTemplateDialog({
  open, onOpenChange, projectId, currentTemplateId, onApply,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(currentTemplateId ?? null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedId(currentTemplateId ?? null);
    (async () => {
      setLoading(true);
      let query = supabase.from("templates").select("*").order("created_at", { ascending: false });
      if (projectId) query = query.eq("project_id", projectId);
      const { data, error } = await query;
      if (error) toast.error(error.message);
      setTemplates((data as any[]) ?? []);
      setLoading(false);
    })();
  }, [open, projectId, currentTemplateId]);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (category !== "all" && (t.category ?? "Geral") !== category) return false;
      if (q && !`${t.name} ${t.description ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [templates, q, category]);

  const selected = filtered.find((t) => t.id === selectedId) ?? templates.find((t) => t.id === selectedId) ?? null;
  const isVideo = (t: any) => (t?.file_type ?? "").startsWith("video/");

  const resolveTemplateUrl = async (t: any): Promise<string | null> => {
    const path = t.file_path ?? t.storage_path ?? t.path;
    if (path) {
      const { data: signed } = await supabase.storage
        .from("templates")
        .createSignedUrl(path, 60 * 60 * 6);
      if (signed?.signedUrl) return signed.signedUrl;
    }
    return t.preview_url ?? t.file_url ?? null;
  };

  const apply = async () => {
    if (!selected) return toast.error("Selecione um template");
    setApplying(true);
    try {
      const url = await resolveTemplateUrl(selected);
      await onApply({ template: selected, url });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao trocar template");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !applying && onOpenChange(o)}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw size={16} className="text-gold" /> Trocar Template
          </DialogTitle>
          <DialogDescription>
            Escolha outro template da biblioteca. Vídeo original, textos, cortes e demais ajustes serão preservados.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou descrição..." className="pl-9" />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_260px]">
          <ScrollArea className="h-[420px] rounded-md border border-border/50 p-2">
            {loading ? (
              <div className="flex h-full items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="mr-2 animate-spin" size={16} /> Carregando templates…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center py-16 text-center text-xs text-muted-foreground">
                Nenhum template encontrado neste projeto.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {filtered.map((t) => {
                  const active = t.id === selectedId;
                  const current = t.id === currentTemplateId;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedId(t.id)}
                      className={cn(
                        "group relative overflow-hidden rounded-md border bg-black text-left transition-all",
                        active ? "border-gold ring-2 ring-gold/60" : "border-border/60 hover:border-gold/40",
                      )}
                    >
                      <div className="relative aspect-[9/12]">
                        {t.preview_url ? (
                          isVideo(t) ? (
                            <video src={t.preview_url} muted loop playsInline preload="metadata" className="h-full w-full object-cover" />
                          ) : (
                            <img src={t.preview_url} alt={t.name} className="h-full w-full object-cover" />
                          )
                        ) : (
                          <div className="flex h-full items-center justify-center text-muted-foreground">
                            <ImageIcon size={24} />
                          </div>
                        )}
                        {active && (
                          <div className="absolute right-1 top-1 rounded-full bg-gold p-1 text-black">
                            <Check size={12} />
                          </div>
                        )}
                        {current && (
                          <Badge variant="outline" className="absolute left-1 top-1 border-gold/40 bg-black/70 text-[9px] text-gold">
                            Atual
                          </Badge>
                        )}
                      </div>
                      <div className="p-1.5">
                        <p className="truncate text-[11px] font-medium">{t.name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{t.category ?? "Geral"}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          <div className="rounded-md border border-border/50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prévia</p>
            {selected ? (
              <div className="space-y-2">
                <div className="aspect-[9/12] w-full overflow-hidden rounded-md bg-black">
                  {selected.preview_url ? (
                    isVideo(selected) ? (
                      <video src={selected.preview_url} controls autoPlay loop muted className="h-full w-full object-contain" />
                    ) : (
                      <img src={selected.preview_url} alt={selected.name} className="h-full w-full object-contain" />
                    )
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground"><ImageIcon /></div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">{selected.name}</p>
                  <p className="text-[11px] text-muted-foreground">{selected.category ?? "Geral"}</p>
                  {selected.description && (
                    <p className="mt-1 text-[11px] text-muted-foreground">{selected.description}</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-xs text-muted-foreground">Selecione um template ao lado para pré-visualizar.</p>
            )}
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          O vídeo original, cortes, textos e legendas serão mantidos. Apenas o overlay do template será substituído.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={applying}>Cancelar</Button>
          <Button onClick={apply} disabled={!selected || applying || selected.id === currentTemplateId}
            className="bg-gold-gradient text-black glow-gold">
            {applying ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Check size={14} className="mr-1" />}
            Aplicar Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
