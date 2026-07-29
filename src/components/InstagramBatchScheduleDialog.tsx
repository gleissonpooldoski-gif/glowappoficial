import { useEffect, useMemo, useState } from "react";
import { Loader2, CalendarClock, Sparkles, Instagram, Youtube, Facebook, Music2, ArrowLeft, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { publishInstagram, friendlyError } from "@/lib/instagram";
import { getYoutubeChannelForProject, type YoutubeCredential } from "@/lib/youtube";
import { getFacebookAccountForProject, createFacebookPost, isFacebookAccountReady, type FacebookAccount } from "@/lib/facebook";
import { findProjectSlots, getProjectSchedule, refreshProjectSlotTracking, DEFAULT_PROJECT_TIMES, type ProjectScheduleSettings } from "@/lib/project-schedules";
import { extractVideoFrames } from "@/lib/videoFrames";
import { describeEdgeError } from "@/lib/edge-errors";

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

type NetId = "instagram" | "facebook" | "youtube" | "tiktok";

const NETS: { id: NetId; label: string; icon: any; color: string }[] = [
  { id: "instagram", label: "Instagram", icon: Instagram, color: "text-pink-400" },
  { id: "facebook", label: "Facebook", icon: Facebook, color: "text-blue-400" },
  { id: "youtube", label: "YouTube", icon: Youtube, color: "text-red-400" },
  { id: "tiktok", label: "TikTok", icon: Music2, color: "text-fuchsia-400" },
];

type ProjectBundle = {
  projectId: string;
  projectName: string | null;
  projectCategory: string | null;
  igAccount: string | null;
  ytChannel: YoutubeCredential | null;
  fbAccount: FacebookAccount | null;
  ttAccount: string | null;
  times: string[];
  postsPerDay: number;
  settings: ProjectScheduleSettings | null;
  lastScheduled: Date | null;
};

type PlanItem = {
  video: VideoMeta;
  projectId: string | null;
  bundle: ProjectBundle | null;
  slot: Date | null;
  reason?: string;
};

function flattenHashtags(h: any): string {
  if (!h) return "";
  if (typeof h === "string") return h;
  const groups = [h.alcance, h.nicho, h.tema].filter(Array.isArray);
  return groups.flat().join(" ");
}

/** Busca o último agendamento (mais futuro) do projeto entre as 4 redes. */
async function fetchLastScheduledForProject(pid: string): Promise<Date | null> {
  const { data: vids } = await supabase.from("videos").select("id").eq("project_id", pid);
  const ids = ((vids ?? []) as any[]).map((r) => r.id);
  if (ids.length === 0) return null;
  const tables = ["instagram_posts", "youtube_posts", "tiktok_posts", "facebook_posts"] as const;
  const results = await Promise.all(
    tables.map((t) =>
      supabase
        .from(t as any)
        .select("scheduled_at")
        .in("video_id", ids)
        .in("status", ["AGENDADO", "PUBLICANDO"])
        .not("scheduled_at", "is", null)
        .order("scheduled_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
  );
  let max = 0;
  for (const r of results) {
    const iso = (r?.data as any)?.scheduled_at as string | undefined;
    if (iso) max = Math.max(max, new Date(iso).getTime());
  }
  return max > 0 ? new Date(max) : null;
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const fmtTime = (d: Date) =>
  d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export default function InstagramBatchScheduleDialog({ open, onOpenChange, videos, onDone }: Props) {
  const [selectedNets, setSelectedNets] = useState<Set<NetId>>(
    new Set(["instagram", "facebook", "youtube", "tiktok"]),
  );
  const [phase, setPhase] = useState<"config" | "preview" | "running">("config");
  const [computing, setComputing] = useState(false);
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      setDone(0); setErrors([]); setPlan([]); setPhase("config"); setBusy(false); setComputing(false);
    }
  }, [open]);

  const toggleNet = (id: NetId) => setSelectedNets((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const buildProjectBundles = async (
    videoRows: { id: string; project_id: string | null }[],
  ): Promise<Map<string, ProjectBundle>> => {
    const projectIds = Array.from(new Set(videoRows.map((v) => v.project_id).filter(Boolean))) as string[];
    const map = new Map<string, ProjectBundle>();
    if (projectIds.length === 0) return map;

    let igByProject = new Map<string, string>();
    try {
      const { data } = await supabase.functions.invoke("instagram-credentials", { body: { action: "get" } });
      const creds = (data?.credentials ?? {}) as Record<string, { account: string; project_id: string | null }>;
      for (const c of Object.values(creds)) {
        if (c.project_id) igByProject.set(c.project_id, c.account);
      }
    } catch { /* ignore */ }

    const { data: projs } = await supabase
      .from("projects")
      .select("id, name, category")
      .in("id", projectIds);
    const projMeta = new Map<string, { name: string | null; category: string | null }>();
    for (const p of ((projs ?? []) as any[])) projMeta.set(p.id, { name: p.name ?? null, category: p.category ?? null });

    for (const pid of projectIds) {
      const meta = projMeta.get(pid) ?? { name: null, category: null };
      const igAccount = igByProject.get(pid) ?? null;
      const [ytChannel, fbAccount, lastScheduled] = await Promise.all([
        getYoutubeChannelForProject(pid).catch(() => null),
        getFacebookAccountForProject(pid).catch(() => null),
        fetchLastScheduledForProject(pid).catch(() => null),
      ]);

      // Fonte de verdade: configuração dinâmica do PROJETO.
      const settings = await getProjectSchedule(pid).catch(() => null);
      const times = settings?.publication_times?.length ? settings.publication_times : DEFAULT_PROJECT_TIMES;
      const postsPerDay = Math.min(settings?.posts_per_day ?? times.length, times.length);

      map.set(pid, {
        projectId: pid,
        projectName: meta.name,
        projectCategory: meta.category,
        igAccount,
        ytChannel: ytChannel ?? null,
        fbAccount: fbAccount ?? null,
        ttAccount: igAccount,
        times,
        postsPerDay,
        settings: settings ?? null,
        lastScheduled,
      });
    }
    return map;
  };

  const genCaption = async (v: VideoMeta & { project_id: string | null }, projMeta: { name: string | null; category: string | null }) => {
    let frames: string[] = [];
    try {
      const { data: row } = await supabase.from("videos").select("processed_path").eq("id", v.id).maybeSingle();
      const path = (row as any)?.processed_path as string | null;
      if (path) {
        const { data: s } = await supabase.storage.from("videos-processed").createSignedUrl(path, 60 * 30);
        if (s?.signedUrl) frames = await extractVideoFrames(s.signedUrl, 3).catch(() => []);
      }
    } catch { /* ignore */ }
    const { data, error } = await supabase.functions.invoke("generate-caption", {
      body: {
        filename: v.filename,
        templateName: v.templateName ?? null,
        projectName: v.projectName ?? projMeta.name,
        projectCategory: v.projectCategory ?? projMeta.category,
        frames,
      },
    });
    if (error || (data as any)?.error) {
      throw new Error(await describeEdgeError(error, data, "Falha ao gerar legenda"));
    }
    const caption = String((data as any)?.caption ?? "").trim();
    const hashtags = flattenHashtags((data as any)?.hashtags);
    if (!caption) throw new Error("IA retornou legenda vazia");
    return { caption, hashtags };
  };

  const scheduleOne = async (
    v: VideoMeta, slot: Date, caption: string, hashtags: string, nets: NetId[], bundle: ProjectBundle,
  ): Promise<string[]> => {
    const errs: string[] = [];
    const iso = slot.toISOString();

    if (nets.includes("instagram")) {
      if (!bundle.igAccount) errs.push("Instagram: conta não vinculada ao projeto");
      else {
        try {
          const res: any = await publishInstagram({
            account: bundle.igAccount, videoId: v.id, caption, hashtags,
            publishNow: false, scheduledAt: iso,
          });
          const igPostId = res?.post?.id ?? null;
          await supabase.from("publish_schedules_multi" as any).insert({
            video_id: v.id, networks: ["instagram"], scheduled_at: iso,
            instagram_post_id: igPostId, youtube_post_id: null, tiktok_post_id: null,
          });
        } catch (e: any) { errs.push(`Instagram: ${friendlyError(e)}`); }
      }
    }

    if (nets.includes("facebook")) {
      if (!bundle.fbAccount) errs.push("Facebook: página não vinculada ao projeto");
      else {
        try {
          if (!isFacebookAccountReady(bundle.fbAccount)) {
            errs.push("Facebook: token expirado. Reconecte a Página antes de agendar");
          } else {
          const description = [caption, hashtags].filter(Boolean).join("\n\n");
          await createFacebookPost({
            project_id: bundle.projectId, video_id: v.id, description,
            publish_now: false, scheduled_at: iso,
          });
          }
        } catch (e: any) { errs.push(`Facebook: ${e?.message ?? "erro"}`); }
      }
    }

    if (nets.includes("tiktok")) {
      if (!bundle.ttAccount) errs.push("TikTok: conta não vinculada ao projeto");
      else {
        try {
          const { buildTiktokCaptionFromBase } = await import("@/lib/tiktok-meta");
          const tt = await buildTiktokCaptionFromBase(caption, hashtags, {
            projectName: bundle.projectName, projectCategory: bundle.projectCategory,
          });
          const { data, error } = await supabase.from("tiktok_posts" as any).insert({
            video_id: v.id, account: bundle.ttAccount,
            caption: tt.caption, status: "AGENDADO", scheduled_at: iso,
          }).select("id").maybeSingle();
          if (error) throw error;
          const ttId = (data as any)?.id ?? null;
          await supabase.from("publish_schedules_multi" as any).insert({
            video_id: v.id, networks: ["tiktok"], scheduled_at: iso,
            instagram_post_id: null, youtube_post_id: null, tiktok_post_id: ttId,
          });
        } catch (e: any) { errs.push(`TikTok: ${e?.message ?? "erro"}`); }
      }
    }

    if (nets.includes("youtube")) {
      if (!bundle.ytChannel?.account) errs.push("YouTube: canal não vinculado ao projeto");
      else {
        try {
          const { buildYoutubeMetaFromCaption } = await import("@/lib/youtube-meta");
          const { title, description, tags } = await buildYoutubeMetaFromCaption(caption, hashtags, {
            projectName: bundle.projectName, projectCategory: bundle.projectCategory, videoId: v.id,
          });
          const { data, error } = await supabase.from("youtube_posts" as any).insert({
            video_id: v.id, account: bundle.ytChannel.account,
            title, description, tags,
            category_id: "22", privacy_status: "public",
            status: "AGENDADO", scheduled_at: iso,
          }).select("id").maybeSingle();
          if (error) throw error;
          const ytId = (data as any)?.id ?? null;
          await supabase.from("publish_schedules_multi" as any).insert({
            video_id: v.id, networks: ["youtube"], scheduled_at: iso,
            instagram_post_id: null, youtube_post_id: ytId, tiktok_post_id: null,
          });
        } catch (e: any) { errs.push(`YouTube: ${e?.message ?? "erro"}`); }
      }
    }

    return errs;
  };

  /** Etapa 1: monta a pré-visualização (distribuição de slots) sem criar nada. */
  const buildPreview = async () => {
    if (selectedNets.size === 0) { toast.error("Selecione ao menos uma rede."); return; }
    if (videos.length === 0) return;
    setComputing(true);
    try {
      const ids = videos.map((v) => v.id);
      const { data: rows } = await supabase.from("videos").select("id, project_id").in("id", ids);
      const projectByVideo = new Map<string, string | null>();
      for (const r of ((rows ?? []) as any[])) projectByVideo.set(r.id, r.project_id ?? null);

      const videoRows = videos.map((v) => ({ id: v.id, project_id: projectByVideo.get(v.id) ?? null }));
      const bundles = await buildProjectBundles(videoRows);

      const perProjectCount = new Map<string, number>();
      const slotCache = new Map<string, Date[]>();

      // Calcula os slots por projeto usando SEMPRE a configuração salva atual.
      for (const [pid, bundle] of bundles.entries()) {
        const total = videoRows.filter((r) => r.project_id === pid).length;
        const slots = await findProjectSlots(pid, total, { settings: bundle.settings }).catch(() => []);
        slotCache.set(pid, slots);
      }

      const items: PlanItem[] = videos.map((v) => {
        const pid = projectByVideo.get(v.id) ?? null;
        if (!pid) return { video: v, projectId: null, bundle: null, slot: null, reason: "Sem projeto vinculado" };
        const bundle = bundles.get(pid) ?? null;
        if (!bundle) return { video: v, projectId: pid, bundle: null, slot: null, reason: "Projeto sem configuração" };
        const idx = perProjectCount.get(pid) ?? 0;
        const slot = (slotCache.get(pid) ?? [])[idx] ?? null;
        perProjectCount.set(pid, idx + 1);
        return { video: v, projectId: pid, bundle, slot, reason: slot ? undefined : "Sem slot disponível" };
      });
      setPlan(items);
      setPhase("preview");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao calcular agendamentos");
    } finally {
      setComputing(false);
    }
  };

  const run = async () => {
    const nets = Array.from(selectedNets);
    if (nets.length === 0) return;
    setPhase("running"); setBusy(true); setDone(0); setErrors([]);
    const allErrs: string[] = [];

    for (let i = 0; i < plan.length; i++) {
      const item = plan[i];
      const label = `Vídeo ${i + 1} (${item.video.filename ?? item.video.id})`;
      if (!item.slot || !item.bundle) {
        allErrs.push(`${label}: ${item.reason ?? "sem slot"}`);
        setDone(i + 1); continue;
      }
      try {
        const { caption, hashtags } = await genCaption(
          { ...item.video, project_id: item.projectId },
          { name: item.bundle.projectName, category: item.bundle.projectCategory },
        );
        const errs = await scheduleOne(item.video, item.slot, caption, hashtags, nets, item.bundle);
        errs.forEach((e) => allErrs.push(`${label}: ${e}`));
      } catch (e: any) {
        allErrs.push(`${label}: legenda não gerada — ${e?.message ?? "erro"}`);
      }
      setDone(i + 1);
    }

    for (const pid of new Set(plan.map((p) => p.projectId).filter(Boolean) as string[])) {
      void refreshProjectSlotTracking(pid);
    }

    setErrors(allErrs);
    setBusy(false);
    if (allErrs.length === 0) {
      toast.success(`${plan.length} vídeo(s) agendados`);
      onOpenChange(false);
      onDone?.();
    } else {
      toast.warning(`Concluído com ${allErrs.length} erro(s).`);
      onDone?.();
    }
  };

  const progress = plan.length ? Math.round((done / plan.length) * 100) : 0;

  // Agrupa "último agendamento" por projeto para o cabeçalho da preview.
  const lastByProject = useMemo(() => {
    const m = new Map<string, { name: string | null; last: Date | null }>();
    for (const it of plan) {
      if (!it.bundle) continue;
      if (!m.has(it.bundle.projectId))
        m.set(it.bundle.projectId, { name: it.bundle.projectName, last: it.bundle.lastScheduled });
    }
    return Array.from(m.values());
  }, [plan]);

  const selectedNetList = Array.from(selectedNets);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock size={16} className="text-gold" /> Publicação em Lote
          </DialogTitle>
          <DialogDescription>
            {videos.length} vídeo(s) serão distribuídos no cronograma de cada projeto, continuando do último agendamento existente.
          </DialogDescription>
        </DialogHeader>

        {phase === "config" && (
          <div className="space-y-3">
            <div className="space-y-2 rounded-lg border border-border/50 bg-background/40 p-3">
              <Label className="text-xs font-semibold">Publicar em</Label>
              <div className="grid grid-cols-2 gap-2">
                {NETS.map((n) => {
                  const Icon = n.icon;
                  const checked = selectedNets.has(n.id);
                  return (
                    <label
                      key={n.id}
                      className={`flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs cursor-pointer transition-colors ${
                        checked ? "border-gold/50 bg-gold/5" : "border-border/60 bg-background/30 hover:bg-background/60"
                      }`}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleNet(n.id)} />
                      <Icon size={14} className={n.color} />
                      <span className="flex-1">{n.label}</span>
                    </label>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1">
                <Sparkles size={11} className="text-gold" />
                Cronograma, contas e legendas são resolvidos automaticamente por projeto.
              </div>
            </div>
          </div>
        )}

        {phase !== "config" && (
          <div className="space-y-3">
            {lastByProject.length > 0 && (
              <div className="rounded-lg border border-border/50 bg-background/40 p-3 space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Clock size={12} className="text-gold" /> Último agendamento encontrado
                </Label>
                {lastByProject.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground truncate">{p.name ?? "Projeto"}</span>
                    <span className="font-medium">
                      {p.last ? `${fmtDate(p.last)} • ${fmtTime(p.last)}` : "— (usará o próximo horário do cronograma)"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg border border-border/50 bg-background/40 p-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-semibold">Próximos agendamentos</Label>
                <span className="text-[11px] text-muted-foreground">
                  Serão criados {plan.filter((p) => p.slot).length} agendamento(s)
                </span>
              </div>
              <div className="max-h-72 overflow-auto divide-y divide-border/40">
                {plan.map((it, i) => (
                  <div key={i} className="py-2 flex items-center justify-between gap-3 text-[11px]">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">
                        Vídeo {String(i + 1).padStart(2, "0")} — {it.video.filename ?? it.video.id}
                      </div>
                      <div className="text-muted-foreground truncate">
                        {it.bundle?.projectName ?? "Sem projeto"}
                      </div>
                    </div>
                    <div className="text-right">
                      {it.slot ? (
                        <>
                          <div className="font-medium">{fmtDate(it.slot)} • {fmtTime(it.slot)}</div>
                          <div className="flex items-center gap-1 justify-end mt-0.5">
                            {selectedNetList.map((nid) => {
                              const N = NETS.find((n) => n.id === nid)!;
                              const Icon = N.icon;
                              return <Icon key={nid} size={11} className={N.color} />;
                            })}
                          </div>
                        </>
                      ) : (
                        <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
                          {it.reason ?? "sem slot"}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {(busy || done > 0) && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span>Agendando…</span>
                  <span className="text-muted-foreground">{done}/{plan.length}</span>
                </div>
                <Progress value={progress} className="h-1.5" />
              </div>
            )}

            {errors.length > 0 && (
              <div className="max-h-40 overflow-auto rounded-md border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive space-y-0.5">
                {errors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {phase === "config" && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
              <Button
                onClick={buildPreview}
                disabled={computing || videos.length === 0 || selectedNets.size === 0}
                className="bg-gold-gradient text-black"
              >
                {computing ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <CalendarClock size={14} className="mr-1.5" />}
                Ver pré-visualização
              </Button>
            </>
          )}
          {phase === "preview" && (
            <>
              <Button variant="ghost" onClick={() => setPhase("config")}>
                <ArrowLeft size={14} className="mr-1.5" /> Voltar
              </Button>
              <Button
                onClick={run}
                disabled={plan.filter((p) => p.slot).length === 0}
                className="bg-gold-gradient text-black"
              >
                <CalendarClock size={14} className="mr-1.5" />
                Confirmar agendamento
              </Button>
            </>
          )}
          {phase === "running" && (
            <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
              {busy ? "Aguarde…" : "Fechar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
