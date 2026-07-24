import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RefreshCw, RotateCcw, Trash2, AlertTriangle } from "lucide-react";
import { platformEmoji, statusLabel, translatePublishError } from "@/lib/errorTranslations";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { NavLink } from "react-router-dom";

interface IssueRow {
  id: string; platform: string; video_id: string | null; account_ref: string | null;
  scheduled_at: string; status: string; attempt_count: number; last_error: string | null;
  last_error_code: string | null; caption: string | null; metadata: any;
}

export default function PublicationIssues() {
  const [rows, setRows] = useState<IssueRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("publish_queue")
      .select("*")
      .in("status", ["NEEDS_ATTENTION", "FAILED"])
      .order("updated_at", { ascending: false })
      .limit(200);
    setRows((data ?? []) as IssueRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggle = (id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  const retry = async (ids: string[]) => {
    if (!ids.length) return;
    const { error } = await supabase.from("publish_queue").update({
      status: "PENDING",
      attempt_count: 0,
      last_error: null,
      last_error_code: null,
      next_attempt_at: new Date().toISOString(),
    }).in("id", ids);
    if (error) toast.error("Falha ao reagendar: " + error.message);
    else { toast.success(`${ids.length} publicação(ões) na fila novamente`); setSelected(new Set()); load(); }
  };

  const remove = async (ids: string[]) => {
    if (!ids.length) return;
    if (!confirm(`Excluir ${ids.length} agendamento(s) com problema?`)) return;
    const { error } = await supabase.from("publish_queue").delete().in("id", ids);
    if (error) toast.error("Falha ao excluir: " + error.message);
    else { toast.success("Removidos"); setSelected(new Set()); load(); }
  };

  const selArr = Array.from(selected);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <AlertTriangle className="text-orange-400" /> Publicações com problema
          </h1>
          <p className="text-sm text-muted-foreground">
            Publicações que falharam e precisam da sua ação. Corrija a causa (geralmente reconectar a rede) e clique em "Tentar novamente".
          </p>
        </div>
        <Button onClick={load} variant="outline" disabled={loading}>
          <RefreshCw size={16} className={loading ? "animate-spin mr-2" : "mr-2"} />
          Atualizar
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-4xl">🎉</div>
          <div className="mt-2 text-sm text-muted-foreground">Nenhuma publicação com problema</div>
        </Card>
      ) : (
        <>
          <Card className="flex items-center justify-between p-3">
            <div className="flex items-center gap-3">
              <Checkbox checked={selected.size === rows.length} onCheckedChange={toggleAll} />
              <span className="text-sm">{selected.size > 0 ? `${selected.size} selecionada(s)` : `${rows.length} publicação(ões)`}</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => retry(selArr)} disabled={!selArr.length}>
                <RotateCcw size={14} className="mr-1" /> Tentar novamente
              </Button>
              <Button size="sm" variant="destructive" onClick={() => remove(selArr)} disabled={!selArr.length}>
                <Trash2 size={14} className="mr-1" /> Excluir
              </Button>
              <NavLink to="/settings"><Button size="sm" variant="outline">Reconectar redes</Button></NavLink>
            </div>
          </Card>

          <div className="space-y-2">
            {rows.map((r) => {
              const s = statusLabel(r.status);
              const errorText = translatePublishError(r.last_error_code, r.last_error ?? "Erro desconhecido");
              return (
                <Card key={r.id} className="flex items-start gap-3 p-4">
                  <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                  <div className="text-2xl">{platformEmoji(r.platform)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium capitalize">{r.platform}</span>
                      <Badge className={s.color}>{s.label}</Badge>
                      <span className="text-xs text-muted-foreground">{r.account_ref}</span>
                      <span className="text-xs text-muted-foreground">• {r.attempt_count} tentativa(s)</span>
                    </div>
                    {r.caption && <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{r.caption}</div>}
                    <div className="mt-2 rounded bg-red-500/10 px-2 py-1 text-xs text-red-300">{errorText}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Agendado para {format(new Date(r.scheduled_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      {" · "}
                      atualizado {formatDistanceToNow(new Date(r.scheduled_at), { addSuffix: true, locale: ptBR })}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button size="sm" variant="outline" onClick={() => retry([r.id])}>
                      <RotateCcw size={14} className="mr-1" /> Tentar
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
