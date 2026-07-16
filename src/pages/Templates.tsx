import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LayoutTemplate, Sparkles, Plus, Pencil, Copy, Trash2, Wand2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const NICHE_SUGGESTIONS = ["Filmes e Séries", "Fitness", "Finanças", "Culinária", "Moda", "Games", "Viagens", "Notícias"];

type Template = {
  id: string;
  name: string;
  description: string | null;
  settings: any;
  is_builtin: boolean;
  updated_at?: string;
};

const PREVIEWS: Record<string, { bg: string; accent: string; label: string }> = {
  "Dark Gold": { bg: "linear-gradient(135deg,#050505,#111)", accent: "#D4AF37", label: "Premium" },
  "Viral Reels": { bg: "linear-gradient(135deg,#0b0b0b,#1a1a1a)", accent: "#FFE066", label: "TikTok" },
  Podcast: { bg: "linear-gradient(135deg,#0f0f14,#1c1c24)", accent: "#B8A47A", label: "Central" },
  News: { bg: "linear-gradient(135deg,#0a0a0a,#161616)", accent: "#E63946", label: "Jornal" },
  Minimal: { bg: "linear-gradient(135deg,#050505,#0d0d0d)", accent: "#FFFFFF", label: "Clean" },
};

export default function Templates() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [toDelete, setToDelete] = useState<Template | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [niche, setNiche] = useState("");
  const [style, setStyle] = useState("");
  const [generating, setGenerating] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    const { data } = await supabase
      .from("templates")
      .select("*")
      .order("created_at", { ascending: true });
    setTemplates((data ?? []) as Template[]);
  };

  useEffect(() => { load(); }, []);

  const duplicate = async (t: Template) => {
    const { error } = await supabase.from("templates").insert({
      name: `${t.name} (cópia)`,
      description: t.description,
      settings: t.settings,
      is_builtin: false,
    });
    if (error) return toast.error(error.message);
    toast.success("Template duplicado");
    load();
  };

  const remove = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("templates").delete().eq("id", toDelete.id);
    setToDelete(null);
    if (error) return toast.error(error.message);
    toast.success("Template excluído");
    load();
  };

  const generateWithAi = async () => {
    if (!niche.trim()) return toast.error("Informe o nicho");
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-template", {
        body: { niche: niche.trim(), stylePrompt: style.trim() || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const { name, description, canvas, elements } = data;
      const { data: inserted, error: insErr } = await supabase
        .from("templates")
        .insert({
          name: name || `Template ${niche}`,
          description: description || `Gerado por IA para ${niche}`,
          settings: { canvas, elements } as any,
          is_builtin: false,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      toast.success("Template gerado pela IA!");
      setAiOpen(false);
      setNiche(""); setStyle("");
      navigate(`/templates/editor/${inserted.id}`);
    } catch (e: any) {
      toast.error(e.message || "Falha ao gerar template");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground">
            Crie um modelo visual uma vez e aplique em centenas de vídeos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setAiOpen(true)}
            variant="outline"
            className="border-gold/40 text-gold hover:bg-gold/10"
          >
            <Wand2 size={16} className="mr-1" /> Gerador Inteligente
          </Button>
          <Button
            onClick={() => navigate("/templates/editor/new")}
            className="bg-gold-gradient text-black glow-gold"
          >
            <Plus size={16} className="mr-1" /> Novo Template
          </Button>
        </div>
      </header>

      {!templates ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const p = PREVIEWS[t.name] ?? PREVIEWS.Minimal;
            const custom = t.settings?.elements?.length > 0;
            return (
              <Card
                key={t.id}
                className="glass border-border/50 group overflow-hidden transition-all hover:-translate-y-0.5 hover:border-gold/40"
              >
                <Link to={`/templates/editor/${t.id}`}>
                  <div
                    className="relative aspect-[9/12] flex items-end p-4 cursor-pointer"
                    style={{ background: p.bg }}
                  >
                    <div className="pointer-events-none absolute inset-0 opacity-40" style={{
                      background: `radial-gradient(400px 200px at 50% 20%, ${p.accent}22, transparent 60%)`,
                    }} />
                    <div className="relative w-full space-y-2 text-white">
                      <div
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest"
                        style={{ background: `${p.accent}22`, color: p.accent, border: `1px solid ${p.accent}55` }}
                      >
                        <Sparkles size={10} /> {custom ? "Personalizado" : p.label}
                      </div>
                      <div className="text-lg font-semibold leading-tight" style={{ color: p.accent }}>
                        {t.name.toUpperCase()}
                      </div>
                      <div className="h-1 w-16 rounded-full" style={{ background: p.accent }} />
                    </div>
                  </div>
                </Link>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium truncate">{t.name}</h3>
                    {t.is_builtin && (
                      <Badge variant="outline" className="border-gold/30 text-[10px] text-gold">
                        Nativo
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {t.description}
                  </p>
                  <div className="mt-3 flex gap-1">
                    <Button asChild variant="outline" size="sm" className="h-7 flex-1 text-xs">
                      <Link to={`/templates/editor/${t.id}`}><Pencil size={12} className="mr-1" /> Editar</Link>
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => duplicate(t)}>
                      <Copy size={12} />
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => setToDelete(t)}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="glass border-dashed">
        <CardContent className="flex items-center gap-3 py-4 text-xs text-muted-foreground">
          <LayoutTemplate size={14} className="text-gold" />
          Templates são aplicados a lotes de vídeos em <strong className="text-foreground">Processamentos</strong>. A renderização final via FFmpeg será integrada em seguida.
        </CardContent>
      </Card>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.name}" será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
