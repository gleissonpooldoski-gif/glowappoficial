import { useEffect, useState } from "react";
import { Calendar, CheckCircle2, Clock, Loader2, AlertCircle, Instagram, Youtube, Music2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Target = {
  id: string;
  video_id: string | null;
  scheduled_at: string;
  platform: "instagram" | "youtube" | "tiktok";
  status: "AGENDADO" | "PUBLICANDO" | "PUBLICADO" | "ERRO" | "CANCELADO";
};

type Group = {
  key: string;
  video_id: string | null;
  scheduled_at: string;
  targets: Target[];
};

const PLATFORM_META = {
  instagram: { label: "Instagram", icon: Instagram, color: "text-pink-300", ring: "border-pink-400/40 bg-pink-500/10" },
  youtube:   { label: "YouTube",   icon: Youtube,   color: "text-red-300",  ring: "border-red-400/40 bg-red-500/10" },
  tiktok:    { label: "TikTok",    icon: Music2,    color: "text-fuchsia-300", ring: "border-fuchsia-400/40 bg-fuchsia-500/10" },
} as const;

function statusVisual(s: Target["status"]) {
  switch (s) {
    case "PUBLICADO":  return { icon: <CheckCircle2 size={10} />, label: "publicado", cls: "text-emerald-300" };
    case "PUBLICANDO": return { icon: <Loader2 size={10} className="animate-spin" />, label: "publicando", cls: "text-amber-300" };
    case "ERRO":       return { icon: <AlertCircle size={10} />, label: "erro", cls: "text-destructive" };
    case "CANCELADO":  return { icon: <AlertCircle size={10} />, label: "cancelado", cls: "text-muted-foreground" };
    default:           return { icon: <Clock size={10} />, label: "aguardando", cls: "text-blue-300" };
  }
}

export default function MultiScheduleTimeline() {
  const [groups, setGroups] = useState<Group[] | null>(null);

  const load = async () => {
    // Janela: últimos 24h publicados + todos futuros ainda em andamento
    const from = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from("publish_targets" as any)
      .select("id, video_id, scheduled_at, platform, status")
      .gte("scheduled_at", from)
      .order("scheduled_at", { ascending: true })
      .limit(300);
    const rows = (data ?? []) as any as Target[];

    const map = new Map<string, Group>();
    for (const r of rows) {
      if (!r.scheduled_at) continue;
      const key = `${r.video_id ?? "novid"}|${r.scheduled_at}`;
      const g = map.get(key) ?? { key, video_id: r.video_id, scheduled_at: r.scheduled_at, targets: [] };
      g.targets.push(r);
      map.set(key, g);
    }
    setGroups(Array.from(map.values()).slice(0, 60));
  };

  useEffect(() => {
    load();
    const t = window.setInterval(load, 10_000);
    return () => window.clearInterval(t);
  }, []);

  if (!groups || groups.length === 0) return null;

  return (
    <Card className="glass border-border/50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-gold" />
          <h2 className="text-sm font-semibold">Calendário multicanal</h2>
          <Badge variant="outline" className="text-[10px]">{groups.length} conteúdo(s)</Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => {
            const d = new Date(g.scheduled_at);
            const allDone = g.targets.every((t) => t.status === "PUBLICADO");
            const anyError = g.targets.some((t) => t.status === "ERRO");
            const overall = allDone ? "Concluído" : anyError ? "Falha parcial" : "Em andamento";
            const overallCls = allDone ? "text-emerald-300" : anyError ? "text-destructive" : "text-blue-300";
            return (
              <div key={g.key} className="rounded-md border border-border/50 bg-background/40 px-3 py-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <div>
                    <div className="font-medium">{format(d, "dd/MM HH:mm", { locale: ptBR })}</div>
                    <div className="text-muted-foreground text-[10px]">Vídeo #{g.video_id?.slice(0, 6) ?? "—"}</div>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${overallCls}`}>{overall}</Badge>
                </div>
                <div className="flex flex-col gap-1">
                  {g.targets.map((t) => {
                    const meta = PLATFORM_META[t.platform];
                    const Icon = meta.icon;
                    const vis = statusVisual(t.status);
                    return (
                      <div key={t.id} className={`flex items-center justify-between gap-2 rounded border ${meta.ring} px-2 py-1 text-[10px]`}>
                        <div className="flex items-center gap-1.5">
                          <Icon size={11} className={meta.color} />
                          <span className={meta.color}>{meta.label}</span>
                        </div>
                        <span className={`inline-flex items-center gap-1 ${vis.cls}`}>
                          {vis.icon} {vis.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
