import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle, HelpCircle, Activity } from "lucide-react";
import { platformEmoji, statusLabel } from "@/lib/errorTranslations";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { NavLink } from "react-router-dom";

interface HealthRow {
  id: string; platform: string; account_ref: string; project_id: string | null;
  status: string; last_check: string | null; expires_at: string | null;
  error_reason: string | null; metadata: any;
}
interface QueueCounts { PUBLISHED: number; PENDING: number; PROCESSING: number; RETRYING: number; NEEDS_ATTENTION: number; FAILED: number; }
interface EventRow { id: string; platform: string; event: string; status: string; created_at: string; detail: any; }

const STATUS_ICON: Record<string, JSX.Element> = {
  connected: <CheckCircle2 className="text-emerald-400" size={18} />,
  expiring_soon: <AlertTriangle className="text-amber-400" size={18} />,
  expired: <XCircle className="text-red-400" size={18} />,
  unknown: <HelpCircle className="text-slate-400" size={18} />,
};

export default function Health() {
  const [health, setHealth] = useState<HealthRow[]>([]);
  const [counts24h, setCounts24h] = useState<QueueCounts>({ PUBLISHED: 0, PENDING: 0, PROCESSING: 0, RETRYING: 0, NEEDS_ATTENTION: 0, FAILED: 0 });
  const [events, setEvents] = useState<EventRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const [{ data: h }, { data: q }, { data: e }] = await Promise.all([
      supabase.from("connection_health").select("*").order("platform"),
      supabase.from("publish_queue").select("status").gte("updated_at", new Date(Date.now() - 24 * 3600_000).toISOString()),
      supabase.from("publish_events").select("id, platform, event, status, created_at, detail").order("created_at", { ascending: false }).limit(30),
    ]);
    setHealth(h ?? []);
    const c: any = { PUBLISHED: 0, PENDING: 0, PROCESSING: 0, RETRYING: 0, NEEDS_ATTENTION: 0, FAILED: 0 };
    (q ?? []).forEach((r: any) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    setCounts24h(c);
    setEvents((e ?? []) as EventRow[]);
  };

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, []);

  const runHealthCheck = async () => {
    setRefreshing(true);
    try {
      const { error } = await supabase.functions.invoke("token-health-check", { body: {} });
      if (error) throw error;
      toast.success("Verificação de tokens concluída");
      await load();
    } catch (e: any) {
      toast.error("Falha na verificação: " + (e?.message ?? e));
    } finally { setRefreshing(false); }
  };

  const hasProblems = health.some((h) => h.status === "expired") || counts24h.NEEDS_ATTENTION > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Saúde do Sistema</h1>
          <p className="text-sm text-muted-foreground">Monitoramento em tempo real de conexões e publicações</p>
        </div>
        <Button onClick={runHealthCheck} disabled={refreshing} variant="outline">
          <RefreshCw size={16} className={refreshing ? "animate-spin mr-2" : "mr-2"} />
          Verificar agora
        </Button>
      </div>

      {hasProblems && (
        <Card className="border-red-500/40 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 text-red-300">
            <AlertTriangle size={18} />
            <span className="font-medium">Atenção necessária</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Existem conexões expiradas ou publicações que precisam da sua ação.
          </p>
          <div className="mt-3 flex gap-2">
            <NavLink to="/publications-issues"><Button size="sm" variant="destructive">Ver publicações com problema</Button></NavLink>
            <NavLink to="/settings"><Button size="sm" variant="outline">Reconectar contas</Button></NavLink>
          </div>
        </Card>
      )}

      {/* Contadores 24h */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {(["PUBLISHED", "PENDING", "PROCESSING", "RETRYING", "NEEDS_ATTENTION", "FAILED"] as const).map((k) => {
          const s = statusLabel(k);
          return (
            <Card key={k} className="p-4">
              <div className={`inline-flex rounded px-2 py-0.5 text-[10px] uppercase tracking-wider ${s.color}`}>{s.label}</div>
              <div className="mt-2 text-2xl font-semibold">{counts24h[k]}</div>
              <div className="text-[11px] text-muted-foreground">Últimas 24h</div>
            </Card>
          );
        })}
      </div>

      {/* Conexões */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Conexões</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {health.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground md:col-span-2">
              Nenhuma verificação executada ainda. Clique em "Verificar agora".
            </Card>
          )}
          {health.map((h) => (
            <Card key={h.id} className="flex items-start justify-between gap-3 p-4">
              <div className="flex items-start gap-3">
                <div className="text-2xl">{platformEmoji(h.platform)}</div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium capitalize">{h.platform}</span>
                    {STATUS_ICON[h.status]}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {h.metadata?.page_name || h.metadata?.channel_title || h.account_ref}
                  </div>
                  {h.error_reason && <div className="mt-1 text-xs text-red-300">{h.error_reason}</div>}
                  {h.last_check && (
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      Verificado {formatDistanceToNow(new Date(h.last_check), { addSuffix: true, locale: ptBR })}
                    </div>
                  )}
                </div>
              </div>
              {h.status === "expired" && (
                <NavLink to="/settings"><Button size="sm" variant="outline">Reconectar</Button></NavLink>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* Timeline eventos */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Activity size={14} /> Eventos recentes
        </h2>
        <Card className="divide-y divide-border">
          {events.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">Nenhum evento registrado</div>}
          {events.map((e) => {
            const s = statusLabel(e.status);
            return (
              <div key={e.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{platformEmoji(e.platform)}</span>
                  <span className="text-xs text-muted-foreground">{e.event}</span>
                  <Badge className={s.color}>{s.label}</Badge>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale: ptBR })}
                </span>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}
