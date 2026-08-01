import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RefreshCw, RotateCcw, Trash2, AlertTriangle, ChevronDown, Wand2 } from "lucide-react";
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

const PLATFORMS: Platform[] = ["instagram", "facebook", "youtube", "tiktok"];

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

type CauseKey = "reconnect" | "permission" | "asset" | "transient" | "other";

interface Cause {
  key: CauseKey;
  tag: string;
  color: string;
  hint: string;
  retryable: boolean;
}

const CAUSES: Record<CauseKey, Cause> = {
  reconnect: {
    key: "reconnect",
    tag: "Reconectar conta",
    color: "bg-orange-500/20 text-orange-300",
    hint: "O token da conta expirou. Reconecte a rede em Configurações e só então clique em Tentar novamente.",
    retryable: false,
  },
  permission: {
    key: "permission",
    tag: "Permissão faltando",
    color: "bg-amber-500/20 text-amber-300",
    hint: "A conta está conectada, mas sem os escopos necessários. Reconecte autorizando todas as permissões.",
    retryable: false,
  },
  asset: {
    key: "asset",
    tag: "Revisar vídeo",
    color: "bg-red-500/20 text-red-300",
    hint: "O arquivo foi rejeitado ou não está disponível. Re-renderize o vídeo antes de tentar novamente.",
    retryable: false,
  },
  transient: {
    key: "transient",
    tag: "Falha temporária",
    color: "bg-yellow-500/20 text-yellow-300",
    hint: "Instabilidade momentânea da API — reenfileirar costuma resolver.",
    retryable: true,
  },
  other: {
    key: "other",
    tag: "Outro erro",
    color: "bg-red-500/20 text-red-300",
    hint: "Verifique a mensagem detalhada abaixo.",
    retryable: true,
  },
};

function categorizeError(msg: string | null): Cause {
  const m = (msg ?? "").toLowerCase();
  if (
    m.includes("code=190") ||
    m.includes("token expirado") ||
    m.includes("session has expired") ||
    m.includes("session has been invalidated") ||
    m.includes("oauthexception") ||
    m.includes("conta não conectada") ||
    m.includes("[ação necessária]")
  ) return CAUSES.reconnect;
  if (
    m.includes("permiss") ||
    m.includes("scope") ||
    m.includes("code=200") ||
    m.includes("code=100") ||
    m.includes("api access blocked")
  ) return CAUSES.permission;
  if (
    m.includes("[revisar]") ||
    m.includes("[revisar vídeo]") ||
    m.includes("arquivo") ||
    m.includes("not found") ||
    m.includes("media") && m.includes("invalid") ||
    m.includes("formato")
  ) return CAUSES.asset;
  if (
    m.includes("idle_timeout") ||
    m.includes("service_degraded") ||
    m.includes("http 503") ||
    m.includes("http 500") ||
    m.includes("is_transient") ||
    m.includes("timeout") ||
    m.includes("code=2 ") ||
    m.includes("code=4 ")
  ) return CAUSES.transient;
  return CAUSES.other;
}

/** Separa a mensagem amigável do payload técnico (JSON bruto da API). */
function splitError(msg: string | null): { summary: string; raw: string | null } {
  const text = (msg ?? "").trim();
  if (!text) return { summary: "Erro desconhecido", raw: null };
  const braceIdx = text.indexOf("\n{");
  if (braceIdx > 0) {
    return { summary: text.slice(0, braceIdx).trim(), raw: text.slice(braceIdx).trim() };
  }
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      const apiMsg = parsed?.meta?.error?.message ?? parsed?.raw ?? "Erro retornado pela API";
      return { summary: String(apiMsg), raw: text };
    } catch {
      return { summary: text.slice(0, 200), raw: text };
    }
  }
  const [first, ...rest] = text.split("\n");
  return { summary: first, raw: rest.length ? rest.join("\n") : null };
}

export default function PublicationIssues() {
  const [rows, setRows] = useState<IssueRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<Platform | "all">("all");
  const [causeFilter, setCauseFilter] = useState<CauseKey | "all">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const mounted = useRef(true);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const results = await Promise.all(PLATFORMS.map(fetchPlatformErrors));
    const all = results.flat().sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1));
    if (!mounted.current) return;
    setRows(all);
    setLoading(false);
  };

  useEffect(() => {
    mounted.current = true;
    load();
    const t = setInterval(() => load(true), 30_000);
    return () => { mounted.current = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rowKey = (r: IssueRow) => `${r.platform}:${r.id}`;

  const visible = useMemo(
    () => rows.filter((r) =>
      (platformFilter === "all" || r.platform === platformFilter) &&
      (causeFilter === "all" || categorizeError(r.error_message).key === causeFilter)
    ),
    [rows, platformFilter, causeFilter],
  );

  const causeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) {
      const k = categorizeError(r.error_message).key;
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [rows]);

  const platformCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.platform] = (c[r.platform] ?? 0) + 1;
    return c;
  }, [rows]);

  const toggle = (key: string) => {
    setSelected((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };
  const toggleAll = () => {
    const keys = visible.map(rowKey);
    const allSelected = keys.length > 0 && keys.every((k) => selected.has(k));
    setSelected(allSelected ? new Set() : new Set(keys));
  };
  const toggleExpanded = (key: string) => {
    setExpanded((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  const groupByPlatform = (list: IssueRow[]) => {
    const byPlat: Record<Platform, string[]> = { instagram: [], facebook: [], youtube: [], tiktok: [] };
    for (const r of list) byPlat[r.platform].push(r.id);
    return PLATFORMS.map((p) => ({ platform: p, ids: byPlat[p] }));
  };

  const retry = async (targets: { platform: Platform; ids: string[] }[]) => {
    const total = targets.reduce((n, t) => n + t.ids.length, 0);
    if (!total || busy) return;
    setBusy(true);
    let ok = 0;
    // Espaça as retentativas em 1 min de intervalo para não estourar rate limit.
    let offset = 60_000;
    for (const { platform, ids } of targets) {
      if (!ids.length) continue;
      const { error } = await supabase
        .from(TABLE_BY_PLATFORM[platform] as any)
        .update({
          status: "AGENDADO",
          error_message: null,
          scheduled_at: new Date(Date.now() + offset).toISOString(),
        })
        .in("id", ids);
      if (error) toast.error(`${platform}: ${error.message}`);
      else { ok += ids.length; offset += 60_000; }

      await supabase.from("publish_queue").update({
        status: "PENDING",
        attempt_count: 0,
        last_error: null,
        last_error_code: null,
        next_attempt_at: new Date().toISOString(),
      }).eq("platform", platform).in("platform_post_id", ids);
    }
    setBusy(false);
    if (ok) toast.success(`${ok} publicação(ões) reenfileirada(s) — sairão nos próximos minutos.`);
    setSelected(new Set());
    load();
  };

  const remove = async (targets: { platform: Platform; ids: string[] }[]) => {
    const total = targets.reduce((n, t) => n + t.ids.length, 0);
    if (!total || busy) return;
    if (!confirm(`Excluir ${total} agendamento(s) com problema?`)) return;
    setBusy(true);
    for (const { platform, ids } of targets) {
      if (!ids.length) continue;
      const { error } = await supabase.from(TABLE_BY_PLATFORM[platform] as any).delete().in("id", ids);
      if (error) toast.error(`${platform}: ${error.message}`);
    }
    setBusy(false);
    toast.success("Removidos");
    setSelected(new Set());
    load();
  };

  const sync = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("sync_publish_queue" as any);
    setBusy(false);
    if (error) toast.error(`Não foi possível sincronizar a fila: ${error.message}`);
    else toast.success("Fila de publicação sincronizada");
    load();
  };

  const selectedRows = rows.filter((r) => selected.has(rowKey(r)));
  const selTargets = groupByPlatform(selectedRows);
  const totalSelected = selectedRows.length;
  const transientRows = rows.filter((r) => CAUSES[categorizeError(r.error_message).key].retryable);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <AlertTriangle className="text-orange-400" /> Publicações com problema
          </h1>
          <p className="text-sm text-muted-foreground">
            Corrija a causa (geralmente reconectar a rede) e clique em "Tentar novamente" — sozinho ou em massa.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={sync} variant="outline" disabled={busy}>
            <Wand2 size={16} className="mr-2" /> Sincronizar fila
          </Button>
          <Button onClick={() => load()} variant="outline" disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin mr-2" : "mr-2"} />
            Atualizar
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-4xl">🎉</div>
          <div className="mt-2 text-sm text-muted-foreground">Nenhuma publicação com problema</div>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Badge
              onClick={() => setPlatformFilter("all")}
              className={`cursor-pointer ${platformFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              Todas as redes ({rows.length})
            </Badge>
            {PLATFORMS.filter((p) => platformCounts[p]).map((p) => (
              <Badge
                key={p}
                onClick={() => setPlatformFilter(p)}
                className={`cursor-pointer capitalize ${platformFilter === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              >
                {platformEmoji(p)} {p} ({platformCounts[p]})
              </Badge>
            ))}
            <span className="mx-1 h-5 w-px bg-border" />
            <Badge
              onClick={() => setCauseFilter("all")}
              className={`cursor-pointer ${causeFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              Todas as causas
            </Badge>
            {(Object.keys(CAUSES) as CauseKey[]).filter((k) => causeCounts[k]).map((k) => (
              <Badge
                key={k}
                onClick={() => setCauseFilter(k)}
                className={`cursor-pointer ${causeFilter === k ? "bg-primary text-primary-foreground" : CAUSES[k].color}`}
              >
                {CAUSES[k].tag} ({causeCounts[k]})
              </Badge>
            ))}
          </div>

          <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={visible.length > 0 && visible.every((r) => selected.has(rowKey(r)))}
                onCheckedChange={toggleAll}
              />
              <span className="text-sm">
                {totalSelected > 0 ? `${totalSelected} selecionada(s)` : `${visible.length} publicação(ões)`}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {transientRows.length > 0 && (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => retry(groupByPlatform(transientRows))}>
                  <RotateCcw size={14} className="mr-1" /> Repetir falhas temporárias ({transientRows.length})
                </Button>
              )}
              <Button size="sm" onClick={() => retry(selTargets)} disabled={!totalSelected || busy}>
                <RotateCcw size={14} className="mr-1" /> Tentar novamente
              </Button>
              <Button size="sm" variant="destructive" onClick={() => remove(selTargets)} disabled={!totalSelected || busy}>
                <Trash2 size={14} className="mr-1" /> Excluir
              </Button>
              <NavLink to="/settings"><Button size="sm" variant="outline">Reconectar redes</Button></NavLink>
            </div>
          </Card>

          <div className="space-y-2">
            {visible.map((r) => {
              const cat = categorizeError(r.error_message);
              const key = rowKey(r);
              const { summary, raw } = splitError(r.error_message);
              const isOpen = expanded.has(key);
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
                    <div className="mt-2 rounded bg-red-500/10 px-2 py-1 text-xs text-red-300 whitespace-pre-wrap break-words">
                      {summary}
                    </div>
                    {raw && (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleExpanded(key)}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          <ChevronDown size={12} className={isOpen ? "rotate-180 transition-transform" : "transition-transform"} />
                          {isOpen ? "Ocultar detalhes técnicos" : "Ver detalhes técnicos"}
                        </button>
                        {isOpen && (
                          <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted/40 p-2 text-[10px] text-muted-foreground whitespace-pre-wrap break-words">
                            {raw}
                          </pre>
                        )}
                      </>
                    )}
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {r.scheduled_at ? `Agendado para ${format(new Date(r.scheduled_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} · ` : ""}
                      atualizado {formatDistanceToNow(new Date(r.updated_at), { addSuffix: true, locale: ptBR })}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => retry([{ platform: r.platform, ids: [r.id] }])}>
                      <RotateCcw size={14} className="mr-1" /> Tentar
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove([{ platform: r.platform, ids: [r.id] }])}>
                      <Trash2 size={14} className="mr-1" /> Excluir
                    </Button>
                  </div>
                </Card>
              );
            })}
            {visible.length === 0 && (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                Nenhuma publicação para o filtro selecionado.
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
