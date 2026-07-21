import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Youtube } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Config = {
  id?: string;
  project_id: string;
  product_name: string;
  product_category: string | null;
  affiliate_link: string;
  is_active: boolean;
};

type Template = {
  id: string;
  project_id: string;
  template: string;
  position: number;
  is_active: boolean;
};

export default function ProjectAffiliateCard({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, t] = await Promise.all([
      supabase.from("project_affiliate_configs" as any).select("*").eq("project_id", projectId).maybeSingle(),
      supabase.from("project_comment_templates" as any).select("*").eq("project_id", projectId).order("position"),
    ]);
    setCfg(((c.data as any) ?? {
      project_id: projectId, product_name: "", product_category: "", affiliate_link: "", is_active: true,
    }) as Config);
    setTemplates((t.data ?? []) as any);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const saveConfig = async () => {
    if (!cfg?.product_name.trim()) {
      toast.error("Nome do produto é obrigatório.");
      return;
    }
    setSaving(true);
    const payload = {
      project_id: projectId,
      product_name: cfg.product_name.trim(),
      product_category: cfg.product_category?.trim() || null,
      affiliate_link: "",
      is_active: cfg.is_active,
    };
    const { error } = await supabase.from("project_affiliate_configs" as any)
      .upsert(payload, { onConflict: "project_id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Configuração salva.");
    load();
  };

  const addTemplate = async () => {
    const nextPos = (templates.at(-1)?.position ?? -1) + 1;
    const { error } = await supabase.from("project_comment_templates" as any).insert({
      project_id: projectId, template: "🔥 Curtiu o conteúdo?\nConfira nossa indicação na BIO 👆", position: nextPos,
    });
    if (error) return toast.error(error.message);
    load();
  };

  const updateTemplate = async (t: Template, patch: Partial<Template>) => {
    const { error } = await supabase.from("project_comment_templates" as any).update(patch).eq("id", t.id);
    if (error) return toast.error(error.message);
    setTemplates((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
  };

  const removeTemplate = async (t: Template) => {
    if (!confirm("Remover este modelo?")) return;
    const { error } = await supabase.from("project_comment_templates" as any).delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    load();
  };

  if (loading) {
    return <Card className="glass border-border/50"><CardContent className="py-6 text-xs text-muted-foreground">Carregando…</CardContent></Card>;
  }

  return (
    <Card className="glass border-border/50">
      <CardContent className="p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Youtube size={16} className="text-red-400" />
          <h2 className="text-sm font-medium">Comentários monetizados — {projectName}</h2>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Após a publicação no YouTube, o sistema comenta automaticamente com um CTA direcionando o público para a BIO deste canal.
          <strong className="text-foreground"> Nenhum link é inserido no comentário</strong> — links no YouTube não ficam clicáveis, então o CTA aponta apenas para a BIO.
          <br />
          <span className="text-yellow-400/80">Requer reconectar o canal do YouTube uma vez para autorizar o escopo de comentários.</span>
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label className="text-xs">Produto (referência interna)</Label>
            <Input value={cfg?.product_name ?? ""} onChange={(e) => setCfg({ ...cfg!, product_name: e.target.value })} placeholder="Ex.: Cineflix" />
          </div>
          <div>
            <Label className="text-xs">Categoria</Label>
            <Input value={cfg?.product_category ?? ""} onChange={(e) => setCfg({ ...cfg!, product_category: e.target.value })} placeholder="Ex.: Filmes, séries e entretenimento" />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border/40 bg-background/20 px-3 py-2">
          <div className="text-xs">
            <div className="font-medium">Publicação automática de comentário</div>
            <div className="text-muted-foreground text-[11px]">Desative para pausar sem apagar os modelos.</div>
          </div>
          <Switch checked={cfg?.is_active ?? true} onCheckedChange={(v) => setCfg({ ...cfg!, is_active: v })} />
        </div>

        <div className="flex justify-end">
          <Button onClick={saveConfig} disabled={saving} className="bg-gold-gradient text-black">
            {saving && <Loader2 size={12} className="mr-1 animate-spin" />} Salvar configuração
          </Button>
        </div>

        <div className="pt-3 border-t border-border/40 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium">Modelos de comentário ({templates.length})</h3>
            <Button size="sm" variant="outline" onClick={addTemplate} className="border-border/60">
              <Plus size={12} className="mr-1" /> Novo modelo
            </Button>
          </div>
          {templates.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
              Nenhum modelo cadastrado.
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((t, i) => (
                <div key={t.id} className="rounded-md border border-border/40 bg-background/20 p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Modelo {i + 1}</span>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1">
                        <Switch checked={t.is_active} onCheckedChange={(v) => updateTemplate(t, { is_active: v })} />
                        <span>Ativo</span>
                      </label>
                      <Button size="icon" variant="ghost" onClick={() => removeTemplate(t)}>
                        <Trash2 size={12} className="text-red-400" />
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    value={t.template}
                    onChange={(e) => setTemplates((prev) => prev.map((x) => x.id === t.id ? { ...x, template: e.target.value } : x))}
                    onBlur={(e) => updateTemplate(t, { template: e.target.value })}
                    rows={4}
                    className="text-xs"
                  />
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            O sistema alterna os modelos automaticamente (rotação por menos usado) e adapta o texto ao vídeo via IA, sempre mantendo o produto e o link intactos.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
