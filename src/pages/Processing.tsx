import { useEffect, useMemo, useState } from "react";
import { Rocket, Loader2, PlayCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export default function Processing() {
  const [projects, setProjects] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [brand, setBrand] = useState<any>(null);
  const [queue, setQueue] = useState<any[]>([]);

  const [projectId, setProjectId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [opts, setOpts] = useState({
    captions: true,
    logo: true,
    music: false,
    effects: true,
  });
  const [starting, setStarting] = useState(false);

  const load = async () => {
    const [pr, tp, br, q] = await Promise.all([
      supabase.from("projects").select("id, name").order("created_at", { ascending: false }),
      supabase.from("templates").select("id, name").order("created_at", { ascending: true }),
      supabase.from("brand_settings").select("*").limit(1).maybeSingle(),
      supabase.from("processing_queue").select("*, videos(filename)").order("created_at", { ascending: false }).limit(40),
    ]);
    setProjects(pr.data ?? []);
    setTemplates(tp.data ?? []);
    setBrand(br.data);
    setQueue(q.data ?? []);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      if (!projectId) {
        setVideos([]);
        return;
      }
      const { data } = await supabase
        .from("videos")
        .select("*")
        .eq("project_id", projectId)
        .neq("status", "finished")
        .order("created_at", { ascending: false });
      setVideos(data ?? []);
      setSelected(new Set());
    })();
  }, [projectId]);

  const toggle = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };

  const canRun = projectId && templateId && selected.size > 0;

  const run = async () => {
    if (!canRun) return;
    setStarting(true);
    const rows = Array.from(selected).map((videoId) => ({
      video_id: videoId,
      project_id: projectId,
      template_id: templateId,
      brand_id: brand?.id ?? null,
      status: "pending" as const,
      progress: 0,
      options: opts,
    }));
    const [{ error: qErr }, { error: vErr }] = await Promise.all([
      supabase.from("processing_queue").insert(rows),
      supabase.from("videos").update({ status: "queued" as const }).in("id", Array.from(selected)),
    ]);
    setStarting(false);
    if (qErr || vErr) return toast.error((qErr ?? vErr)?.message);
    toast.success(`${rows.length} vídeo(s) na fila de geração.`);
    setSelected(new Set());
    load();
  };

  const stats = useMemo(() => {
    const total = queue.length;
    const done = queue.filter((q) => q.status === "done").length;
    const pending = queue.filter((q) => q.status === "pending" || q.status === "processing").length;
    const errors = queue.filter((q) => q.status === "error").length;
    return { total, done, pending, errors };
  }, [queue]);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Processamentos</h1>
        <p className="text-sm text-muted-foreground">
          Gere lotes de vídeos aplicando template e sua identidade visual.
        </p>
      </header>

      <Card className="glass border-border/50">
        <CardContent className="grid gap-5 p-6 lg:grid-cols-3">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>1. Projeto</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um projeto" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>2. Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha um template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border border-border/50 p-3">
              <Label className="text-xs">3. Identidade visual</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                {brand?.page_name ? `Usando marca: ${brand.page_name}` : "Nenhuma marca configurada"}
              </p>
            </div>
          </div>

          <div className="space-y-2 lg:col-span-2">
            <Label>4. Vídeos ({selected.size} selecionados)</Label>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border/50 p-2">
              {videos.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">
                  {projectId ? "Nenhum vídeo pendente neste projeto." : "Selecione um projeto."}
                </p>
              ) : (
                <div className="grid gap-1 sm:grid-cols-2">
                  {videos.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => toggle(v.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition",
                        selected.has(v.id)
                          ? "border-gold/60 bg-gold/10"
                          : "border-border/50 hover:border-gold/30"
                      )}
                    >
                      <PlayCircle size={14} className="text-gold" />
                      <span className="min-w-0 flex-1 truncate">{v.filename}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["captions", "logo", "music", "effects"] as const).map((k) => (
                <label
                  key={k}
                  className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2 text-xs capitalize"
                >
                  {k}
                  <Switch
                    checked={opts[k]}
                    onCheckedChange={(v) => setOpts((o) => ({ ...o, [k]: v }))}
                  />
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-card/40 px-3 py-2 text-xs text-muted-foreground">
              <span>Formato: 9:16 · Resolução: 1080x1920</span>
              <span>Renderização via FFmpeg (integração pendente)</span>
            </div>
            <div className="flex justify-end">
              <Button
                size="lg"
                disabled={!canRun || starting}
                onClick={run}
                className="bg-gold-gradient text-black glow-gold"
              >
                {starting ? (
                  <Loader2 size={16} className="mr-1 animate-spin" />
                ) : (
                  <Rocket size={16} className="mr-1" />
                )}
                GERAR VÍDEOS
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { l: "Total", v: stats.total },
          { l: "Concluídos", v: stats.done },
          { l: "Pendentes", v: stats.pending },
          { l: "Erros", v: stats.errors },
        ].map((s) => (
          <Card key={s.l} className="glass border-border/50">
            <CardContent className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {s.l}
              </div>
              <div className="mt-1 text-2xl font-semibold">{s.v}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="glass border-border/50">
        <CardContent className="p-4">
          <h3 className="mb-3 text-sm font-medium">Fila de processamento</h3>
          {queue.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Fila vazia.</p>
          ) : (
            <div className="space-y-2">
              {queue.map((q) => (
                <div
                  key={q.id}
                  className="rounded-lg border border-border/50 bg-card/40 p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="truncate text-xs">{q.videos?.filename ?? "Vídeo"}</p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        q.status === "done" && "border-green-500/40 text-green-400",
                        q.status === "error" && "border-destructive/50 text-destructive",
                        q.status === "processing" && "border-gold/40 text-gold",
                      )}
                    >
                      {q.status}
                    </Badge>
                  </div>
                  <Progress value={q.progress ?? 0} className="mt-2 h-1.5" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
