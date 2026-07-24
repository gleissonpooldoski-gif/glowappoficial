import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RefreshCw, RotateCcw, Trash2, AlertTriangle } from "lucide-react";
import { platformEmoji } from "@/lib/errorTranslations";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { NavLink } from "react-router-dom";

type Platform = "instagram" | "facebook" | "youtube" | "tiktok";

interface IssueRow {
  id: string;
  platform: Platform;
  video_id: string | null;
  account: string | null;
  scheduled_at: string | null;
  updated_at: string;
  error_message: string | null;
}

const TABLE_BY_PLATFORM: Record<Platform, string> = {
  instagram: "instagram_posts",
  facebook: "facebook_posts",
  youtube: "youtube_posts",
  tiktok: "tiktok_posts",
};

const ACCOUNT_COL: Record<Platform, string> = {
  instagram: "account",
  facebook: "page_id",
  youtube: "account",
  tiktok: "account",
};

async function fetchPlatformErrors(platform: Platform): Promise<IssueRow[]> {
  const table = TABLE_BY_PLATFORM[platform];
  const accCol = ACCOUNT_COL[platform];
  const { data, error } = await supabase
    .from(table as any)
    .select(`id, video_id, scheduled_at, updated_at, error_message, ${accCol}`)
    .eq("status", "ERRO")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return [];
  return ((data as any[]) ?? []).map((r) => ({
    id: r.id,
    platform,
    video_id: r.video_id,
    account: r[accCol] ?? null,
    scheduled_at: r.scheduled_at,
    updated_at: r.updated_at,
    error_message: r.error_message,
  }));
}

function categorizeError(msg: string | null): { tag: string; color: string; hint: string } {
  const m = (msg ?? "").toLowerCase();
  if (m.includes("[ação necessária]") || m.includes("code=190") || m.includes("api access blocked") || m.includes("code=200")) {
    return { tag: "Reconectar conta", color: "bg-orange-500/20 text-orange-300", hint: "Reconecte a rede em Integrações e clique em Tentar novamente." };
  }
  if (m.includes("[revisar]") || m.includes("[revisar vídeo]")) {
    return { tag: "Revisar vídeo", color: "bg-red-500/20 text-red-300", hint: "Vídeo com falhas recorrentes — re-renderize antes de tentar novamente." };
  }
  if (m.includes("idle_timeout") || m.includes("service_degraded") || m.includes("http 503") || m.includes("is_transient") || m.includes("code=2") || m.includes("code=4")) {
    return { tag: "Transitório", color: "bg-yellow-500/20 text-yellow-300", hint: "Falha momentânea — pode tentar novamente." };
  }
  return { tag: "Erro", color: "bg-red-500/20 text-red-300", hint: "Verifique a mensagem." };
}

export default function PublicationIssues() {
  const [rows, setRows] = useState<IssueRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const results = await Promise.all([
      fetchPlatformErrors("instagram"),
      fetchPlatformErrors("facebook"),
      fetchPlatformErrors("youtube"),
      fetchPlatformErrors("tiktok"),
    ]);
    const all = results.flat().sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1));
    setRows(all);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const rowKey = (r: IssueRow) => `${r.platform}:${r.id}`;
  const toggle = (key: string) => {
    setSelected((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };
  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map(rowKey)));
  };

  const groupSelectedByPlatform = () => {
    const byPlat: Record<Platform, string[]> = { instagram: [], facebook: [], youtube: [], tiktok: [] };
    for (const r of rows) if (selected.has(rowKey(r))) byPlat[r.platform].push(r.id);
    return byPlat;
  };

  const retry = async (targets: { platform: Platform; ids: string[] }[]) => {
    const total = targets.reduce((n, t) => n + t.ids.length, 0);
    if (!total) return;
    let ok = 0;
    for (const { platform, ids } of targets) {
      if (!ids.length) continue;
      const { error } = await supabase
        .from(TABLE_BY_PLATFORM[platform] as any)
        .update({
          status: "AGENDADO",
          error_message: null,
          scheduled_at: new Date(Date.now() + 60_000).toISOString(),
        })
        .in("id", ids);
      if (error) toast.error(`${platform}: ${error.message}`);
      else ok += ids.length;
    }
    // Sincroniza a publish_queue quando existir referência
    for (const { platform, ids } of targets) {
      if (!ids.length) continue;
      await supabase.from("publish_queue").update({
        status: "PENDING",
        attempt_count: 0,
        last_error: null,
        last_error_code: null,
        next_attempt_at: new Date().toISOString(),
      }).eq("platform", platform).in("platform_post_id", ids);
    }
    if (ok) toast.success(`${ok} publicação(ões) reenfileirada(s)`);
    setSelected(new Set());
    load();
  };

  const remove = async (targets: { platform: Platform; ids: string[] }[]) => {
    const total = targets.reduce((n, t) => n + t.ids.length, 0);
    if (!total) return;
    if (!confirm(`Excluir ${total} agendamento(s) com problema?`)) return;
    for (const { platform, ids } of targets) {
      if (!ids.length) continue;
      await supabase.from(TABLE_BY_PLATFORM[platform] as any).delete().in("id", ids);
    }
    toast.success("Removidos");
    setSelected(new Set());
    load();
  };

  const grouped = groupSelectedByPlatform();
  const selTargets = (Object.keys(grouped) as Platform[]).map((p) => ({ platform: p, ids: grouped[p] }));
  const totalSelected = selTargets.reduce((n, t) => n + t.ids.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <AlertTriangle className="text-orange-400" /> Publicações com problema
          </h1>
          <p className="text-sm text-muted-foreground">
            Corrija a causa (geralmente reconectar a rede) e clique em "Tentar novamente" — sozinho ou em massa.
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
              <span className="text-sm">{totalSelected > 0 ? `${totalSelected} selecionada(s)` : `${rows.length} publicação(ões)`}</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => retry(selTargets)} disabled={!totalSelected}>
                <RotateCcw size={14} className="mr-1" /> Tentar novamente
              </Button>
              <Button size="sm" variant="destructive" onClick={() => remove(selTargets)} disabled={!totalSelected}>
                <Trash2 size={14} className="mr-1" /> Excluir
              </Button>
              <NavLink to="/settings"><Button size="sm" variant="outline">Reconectar redes</Button></NavLink>
            </div>
          </Card>

          <div className="space-y-2">
            {rows.map((r) => {
              const cat = categorizeError(r.error_message);
              const key = rowKey(r);
              return (
                <Card key={key} className="flex items-start gap-3 p-4">
                  <Checkbox checked={selected.has(key)} onCheckedChange={() => toggle(key)} />
                  <div className="text-2xl">{platformEmoji(r.platform)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium capitalize">{r.platform}</span>
                      <Badge className={cat.color}>{cat.tag}</Badge>
                      {r.account && <span className="text-xs text-muted-foreground">{r.account}</span>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{cat.hint}</div>
                    <div className="mt-2 rounded bg-red-500/10 px-2 py-1 text-xs text-red-300 line-clamp-3 whitespace-pre-wrap break-words">
                      {r.error_message ?? "Erro desconhecido"}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {r.scheduled_at ? `Agendado para ${format(new Date(r.scheduled_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} · ` : ""}
                      atualizado {formatDistanceToNow(new Date(r.updated_at), { addSuffix: true, locale: ptBR })}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button size="sm" variant="outline" onClick={() => retry([{ platform: r.platform, ids: [r.id] }])}>
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
