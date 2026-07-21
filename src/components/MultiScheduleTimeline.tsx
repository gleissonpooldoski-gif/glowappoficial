import { useEffect, useState } from "react";
import { Calendar, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { NETWORK_MAP, NetworkId } from "@/lib/publish-networks";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Row = {
  id: string;
  video_id: string | null;
  networks: NetworkId[];
  scheduled_at: string;
};

export default function MultiScheduleTimeline() {
  const [rows, setRows] = useState<Row[] | null>(null);

  const load = async () => {
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from("publish_schedules_multi" as any)
      .select("id, video_id, networks, scheduled_at")
      .gte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(30);
    setRows((data as any) ?? []);
  };

  useEffect(() => {
    load();
    const t = window.setInterval(load, 10_000);
    return () => window.clearInterval(t);
  }, []);

  if (!rows) return null;
  if (rows.length === 0) return null;

  return (
    <Card className="glass border-border/50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-gold" />
          <h2 className="text-sm font-semibold">Calendário multicanal</h2>
          <Badge variant="outline" className="text-[10px]">{rows.length} agendamento(s)</Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const d = new Date(r.scheduled_at);
            return (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2">
                <div className="text-[11px]">
                  <div className="font-medium">{format(d, "dd/MM HH:mm", { locale: ptBR })}</div>
                  <div className="text-muted-foreground text-[10px]">Vídeo #{r.video_id?.slice(0, 6) ?? "—"}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  {(r.networks ?? []).map((nid) => {
                    const meta = NETWORK_MAP[nid];
                    if (!meta) return null;
                    const Icon = meta.icon;
                    return (
                      <div key={nid} title={meta.label}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-border/60 bg-background/70">
                        <Icon size={12} className={meta.color} />
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
