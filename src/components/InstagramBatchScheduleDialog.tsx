import { useEffect, useMemo, useState } from "react";
import { Loader2, CalendarClock, RefreshCw, Sparkles, Wand2, Hand, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { InstagramAccount, publishInstagram, friendlyError, useIgAccountForProject, platformLabelFor } from "@/lib/instagram";
import { useYoutubeChannelForProject } from "@/lib/youtube";
import { findNextSlots, ScheduleNetwork, scheduleAccountFor } from "@/lib/schedules";
import { useActiveProject } from "@/context/ProjectContext";
import { extractVideoFrames } from "@/lib/videoFrames";
import { NETWORKS, NetworkId } from "@/lib/publish-networks";

type VideoMeta = {
  id: string;
  filename?: string;
  templateName?: string | null;
  projectName?: string | null;
  projectCategory?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  videos: VideoMeta[];
  onDone?: () => void;
};

function flattenHashtags(h: any): string {
  if (!h) return "";
  if (typeof h === "string") return h;
  const groups = [h.alcance, h.nicho, h.tema].filter(Array.isArray);
  return groups.flat().join(" ");
}

function fmt(d: Date) {
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function InstagramBatchScheduleDialog({ open, onOpenChange, videos, onDone }: Props) {
  const { activeProject } = useActiveProject();
  const { account: igAccount, displayName: igDisplayName, loading: igLoading } = useIgAccountForProject(activeProject?.id ?? null);
  const { account: ytAccount, channelTitle: ytChannelTitle, loading: ytLoading } = useYoutubeChannelForProject(activeProject?.id ?? null);
  const platformLabel = platformLabelFor(igAccount, igDisplayName);

  const [selectedNets, setSelectedNets] = useState<Set<NetworkId>>(new Set(["instagram"]));
  const toggleNet = (id: NetworkId) => setSelectedNets((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const [slots, setSlots] = useState<Date[]>([]);
  const [slotBusy, setSlotBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [startMode, setStartMode] = useState<"auto" | "manual">("auto");
  const initial = useMemo(() => new Date(Date.now() + 60 * 60 * 1000), []);
  const [startDate, setStartDate] = useState(initial.toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState(initial.toTimeString().slice(0, 5));

  const parseStart = (): Date | null => {
    if (startMode !== "manual") return null;
    if (!startDate || !startTime) return null;
    const [y, m, d] = startDate.split("-").map(Number);
    const [hh, mm] = startTime.split(":").map(Number);
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
    if (isNaN(dt.getTime())) return null;
    return dt;
  };

  const compute = async () => {
    setSlotBusy(true);
    try {
      const startFrom = parseStart();
      if (startMode === "manual" && startFrom && startFrom.getTime() < Date.now() + 60_000) {
        toast.error("Selecione uma data/hora futura para começar.");
        setSlots([]);
        return;
      }
      // Cronograma é do PROJETO — busca uma única lista via IG (ou YT como fallback).
      let list: Date[] = [];
      if (igAccount) {
        try { list = await findNextSlots("instagram", igAccount, videos.length, { startFrom }); } catch { /* ignore */ }
      }
      if (list.length === 0 && ytAccount) {
        try { list = await findNextSlots("youtube", ytAccount, videos.length, { startFrom }); } catch { /* ignore */ }
      }
      setSlots(list);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao calcular horários");
    } finally {
      setSlotBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setDone(0); setErrors([]);
    void compute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, igAccount, videos.length, startMode, startDate, startTime, selectedNets]);

  // Redes selecionadas com slots insuficientes:
  const activeNets = Array.from(selectedNets).filter(
    (n) => (NETWORKS.find((x) => x.id === n)?.available)
      && (n === "youtube" || !!igAccount),
  ) as NetworkId[];
  const insufficientNets = activeNets.filter((n) => (slotsByNet[n]?.length ?? 0) < videos.length);
  const insufficient = insufficientNets.length > 0;

  const genCaption = async (v: VideoMeta) => {
    try {
      let frames: string[] = [];
      try {
        const { data: row } = await supabase
          .from("videos")
          .select("processed_path")
          .eq("id", v.id)
          .maybeSingle();
        const path = (row as any)?.processed_path as string | null;
        if (path) {
          const { data: s } = await supabase.storage.from("videos-processed").createSignedUrl(path, 60 * 30);
          if (s?.signedUrl) frames = await extractVideoFrames(s.signedUrl, 3).catch(() => []);
        }
      } catch {}
      const { data, error } = await supabase.functions.invoke("generate-caption", {
        body: {
          filename: v.filename,
          templateName: v.templateName ?? null,
          projectName: v.projectName ?? null,
          projectCategory: v.projectCategory ?? null,
          frames,
        },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error ?? error?.message ?? "Falha ao gerar legenda");
      const caption = String((data as any)?.caption ?? "").trim();
      const hashtags = flattenHashtags((data as any)?.hashtags);
      if (!caption) throw new Error("IA retornou legenda vazia");
      return { caption, hashtags };
    } catch (e: any) {
      throw new Error(e?.message ?? "Falha ao gerar legenda");
    }
  };

  const scheduleOne = async (
    v: VideoMeta, slotFor: Partial<Record<NetworkId, Date>>, caption: string, hashtags: string, nets: NetworkId[],
  ): Promise<string[]> => {
    const errs: string[] = [];
    let igPostId: string | null = null;
    let ttPostId: string | null = null;
    let ytPostId: string | null = null;

    if (nets.includes("instagram") && slotFor.instagram) {
      const iso = slotFor.instagram.toISOString();
      if (!igAccount) errs.push("Instagram: projeto ativo inválido");
      else {
        try {
          const res: any = await publishInstagram({
            account: igAccount, videoId: v.id, caption, hashtags,
            publishNow: false, scheduledAt: iso,
          });
          igPostId = res?.post?.id ?? null;
          await supabase.from("publish_schedules_multi" as any).insert({
            video_id: v.id, networks: ["instagram"], scheduled_at: iso,
            instagram_post_id: igPostId, youtube_post_id: null, tiktok_post_id: null,
          });
        } catch (e: any) { errs.push(`Instagram: ${friendlyError(e)}`); }
      }
    }

    if (nets.includes("tiktok") && slotFor.tiktok) {
      const iso = slotFor.tiktok.toISOString();
      const ttAccount = igAccount;
      if (!ttAccount) errs.push("TikTok: projeto ativo inválido");
      else {
        try {
          // Caption adaptada para TikTok (gancho + hashtags de descoberta).
          const { buildTiktokCaptionFromBase } = await import("@/lib/tiktok-meta");
          const tt = await buildTiktokCaptionFromBase(caption, hashtags, {
            projectName: v.projectName ?? null, projectCategory: v.projectCategory ?? null,
          });
          const { data, error } = await supabase.from("tiktok_posts" as any).insert({
            video_id: v.id, account: ttAccount,
            caption: tt.caption,
            status: "AGENDADO", scheduled_at: iso,
          }).select("id").maybeSingle();
          if (error) throw error;
          ttPostId = (data as any)?.id ?? null;
          await supabase.from("publish_schedules_multi" as any).insert({
            video_id: v.id, networks: ["tiktok"], scheduled_at: iso,
            instagram_post_id: null, youtube_post_id: null, tiktok_post_id: ttPostId,
          });
        } catch (e: any) { errs.push(`TikTok: ${e?.message ?? "erro"}`); }
      }
    }

    if (nets.includes("youtube") && slotFor.youtube) {
      const iso = slotFor.youtube.toISOString();
      if (!ytAccount) {
        errs.push("YouTube: nenhum canal vinculado a este projeto.");
      } else {
        try {
          // Título NUNCA usa nome do arquivo — sempre gerado a partir da legenda.
          const { buildYoutubeMetaFromCaption } = await import("@/lib/youtube-meta");
          const { title, description, tags } = await buildYoutubeMetaFromCaption(caption, hashtags);
          try {
            const { data, error } = await supabase.from("youtube_posts" as any).insert({
              video_id: v.id, account: ytAccount,
              title, description, tags,
              category_id: "22", privacy_status: "public",
              status: "AGENDADO", scheduled_at: iso,
            }).select("id").maybeSingle();
            if (error) throw error;
            const ytId = (data as any)?.id ?? null;
            ytPostId = ytId;
            await supabase.from("publish_schedules_multi" as any).insert({
              video_id: v.id, networks: ["youtube"], scheduled_at: iso,
              instagram_post_id: null, youtube_post_id: ytId, tiktok_post_id: null,
            });
          } catch (e: any) {
            errs.push(`YouTube: ${e?.message ?? "erro"}`);
          }
        } catch (e: any) { errs.push(`YouTube: ${e?.message ?? "erro"}`); }
      }
    }

    return errs;
  };

  const run = async () => {
    const nets = activeNets;
    if (nets.length === 0) { toast.error("Selecione ao menos uma rede social."); return; }
    if (nets.includes("instagram") && !igAccount) {
      toast.error(igLoading ? "Carregando conta do projeto…" : "Este projeto não tem uma conta do Instagram vinculada. Cadastre em Configurações → Instagram."); return;
    }
    if (nets.includes("youtube") && !ytAccount) {
      toast.error(ytLoading ? "Carregando canal do projeto…" : "Este projeto não tem um canal do YouTube vinculado. Configure em Configurações → YouTube."); return;
    }
    if (videos.length === 0) return;
    if (insufficient) {
      toast.error(`Slots insuficientes em: ${insufficientNets.join(", ")}.`);
      return;
    }
    if (!confirm(`Agendar ${videos.length} vídeo(s) em ${nets.length} rede(s): ${nets.join(", ")}?`)) return;
    setBusy(true); setDone(0); setErrors([]);
    const allErrs: string[] = [];
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      const slotFor: Partial<Record<NetworkId, Date>> = {};
      for (const n of nets) slotFor[n] = slotsByNet[n]?.[i];
      try {
        const { caption, hashtags } = await genCaption(v);
        const errs = await scheduleOne(v, slotFor, caption, hashtags, nets);
        errs.forEach((e) => allErrs.push(`Vídeo ${i + 1} (${v.filename ?? v.id}): ${e}`));
      } catch (e: any) {
        allErrs.push(`Vídeo ${i + 1} (${v.filename ?? v.id}): legenda não gerada — ${e?.message ?? "erro"}. Post não agendado.`);
      }
      setDone(i + 1);
    }
    setErrors(allErrs);
    setBusy(false);
    if (allErrs.length === 0) {
      toast.success(`${videos.length} vídeo(s) agendados em ${nets.length} rede(s)`);
      onOpenChange(false);
      onDone?.();
    } else {
      toast.warning(`Concluído com ${allErrs.length} erro(s). Veja detalhes.`);
      onDone?.();
    }
  };

  const progress = videos.length ? Math.round((done / videos.length) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock size={16} className="text-gold" /> Agendar em múltiplas redes
          </DialogTitle>
          <DialogDescription>
            Distribui automaticamente os vídeos nos próximos horários livres da grade nas redes escolhidas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Redes sociais */}
          <div className="space-y-2 rounded-lg border border-border/50 bg-background/40 p-3">
            <Label className="text-xs font-semibold">Redes sociais</Label>
            <div className="grid grid-cols-2 gap-2">
              {NETWORKS.map((n) => {
                const Icon = n.icon;
                const checked = selectedNets.has(n.id);
                const disabled = !n.available || busy;
                return (
                  <label
                    key={n.id}
                    className={`flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs cursor-pointer transition-colors ${
                      checked ? "border-gold/50 bg-gold/5" : "border-border/60 bg-background/30"
                    } ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-background/60"}`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => !disabled && toggleNet(n.id)}
                      disabled={disabled}
                    />
                    <Icon size={14} className={n.color} />
                    <span className="flex-1">{n.label}</span>
                    {!n.available && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0">{n.soonLabel}</Badge>
                    )}
                  </label>
                );
              })}
            </div>
            {selectedNets.has("instagram") && (
              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 text-[11px]">
                <Lock size={10} />
                <span className="text-muted-foreground">Instagram usa o projeto ativo:</span>
                <Badge variant="outline" className="text-[10px]">{platformLabel}</Badge>
              </div>
            )}
            {selectedNets.has("youtube") && (
              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 text-[11px]">
                <Lock size={10} />
                <span className="text-muted-foreground">YouTube usa o canal do projeto:</span>
                <Badge variant="outline" className="text-[10px]">
                  ▶️ {ytChannelTitle ?? (ytLoading ? "carregando…" : ytAccount ?? "sem canal vinculado")}
                </Badge>
              </div>
            )}
          </div>

          {/* Início */}
          <div className="space-y-2 rounded-lg border border-border/50 bg-background/40 p-3">
            <div className="flex items-center gap-1">
              <Button
                type="button" size="sm"
                variant={startMode === "auto" ? "default" : "ghost"}
                className={startMode === "auto" ? "bg-gold-gradient text-black h-8" : "h-8"}
                onClick={() => setStartMode("auto")}
                disabled={busy}
              >
                <Wand2 size={12} className="mr-1" /> Automático
              </Button>
              <Button
                type="button" size="sm"
                variant={startMode === "manual" ? "default" : "ghost"}
                className={startMode === "manual" ? "bg-gold-gradient text-black h-8" : "h-8"}
                onClick={() => setStartMode("manual")}
                disabled={busy}
              >
                <Hand size={12} className="mr-1" /> Começar em…
              </Button>
            </div>
            {startMode === "manual" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Data inicial</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={busy} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Hora inicial</Label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={busy} />
                </div>
              </div>
            )}
          </div>

          {/* Resumo por rede */}
          <div className="rounded-lg border border-border/50 bg-background/40 p-3 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium">Resumo do lote ({videos.length} vídeo(s))</span>
              <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px]"
                onClick={compute} disabled={slotBusy || busy}>
                {slotBusy ? <Loader2 size={12} className="mr-1 animate-spin" /> : <RefreshCw size={12} className="mr-1" />}
                Recalcular
              </Button>
            </div>
            {activeNets.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Selecione ao menos uma rede acima.</p>
            )}
            {activeNets.map((n) => {
              const meta = NETWORKS.find((x) => x.id === n)!;
              const Icon = meta.icon;
              const list = slotsByNet[n] ?? [];
              const enough = list.length >= videos.length;
              return (
                <div key={n} className="rounded-md border border-border/40 bg-background/30 p-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Icon size={12} className={meta.color} />
                    <span className="font-medium">{meta.label}</span>
                    <Badge variant="outline" className={`ml-auto text-[10px] ${enough ? "" : "border-destructive/60 text-destructive"}`}>
                      {list.length}/{videos.length} slots
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                    <div>Primeiro: <span className="text-foreground font-medium">{list[0] ? fmt(list[0]) : "—"}</span></div>
                    <div>Último: <span className="text-foreground font-medium">{list[videos.length - 1] ? fmt(list[videos.length - 1]) : "—"}</span></div>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Sparkles size={11} className="text-gold" />
              Legenda e hashtags são geradas automaticamente. Cada rede segue sua própria grade.
            </div>
          </div>

          {(busy || done > 0) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span>Agendando…</span>
                <span className="text-muted-foreground">{done}/{videos.length}</span>
              </div>
              <Progress value={progress} className="h-1.5" />
            </div>
          )}

          {errors.length > 0 && (
            <div className="max-h-32 overflow-auto rounded-md border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive">
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button
            onClick={run}
            disabled={busy || slotBusy || videos.length === 0 || activeNets.length === 0 || insufficient}
            className="bg-gold-gradient text-black"
          >
            {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <CalendarClock size={14} className="mr-1.5" />}
            Confirmar agendamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
