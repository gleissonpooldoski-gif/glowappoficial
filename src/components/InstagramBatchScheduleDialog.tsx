import { useEffect, useMemo, useState } from "react";
import { Loader2, CalendarClock, Sparkles, Instagram, Youtube, Facebook, Music2 } from "lucide-react";
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
import { getFacebookAccountForProject, createFacebookPost } from "@/lib/facebook";
import { getSchedule, DEFAULT_TIMES, type ScheduleNetwork } from "@/lib/schedules";
import { extractVideoFrames } from "@/lib/videoFrames";

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
  igAccount: string | null;      // slug em instagram_credentials.account
  ytChannel: YoutubeCredential | null;
  fbAccount: { id: string; page_id: string; page_name: string | null } | null;
  ttAccount: string | null;      // usa mesmo slug do IG (frame/resenha)
  times: string[];               // horários da grade do projeto
};

function flattenHashtags(h: any): string {
  if (!h) return "";
  if (typeof h === "string") return h;
  const groups = [h.alcance, h.nicho, h.tema].filter(Array.isArray);
  return groups.flat().join(" ");
}

/** Constrói lista de N slots futuros a partir da grade do projeto, avançando
 *  automaticamente para o próximo dia quando esgotar os horários do dia. */
function buildSlotsFromTimes(times: string[], count: number, offsetToday: Set<number> = new Set()): Date[] {
  if (times.length === 0 || count <= 0) return [];
  const parsed = times
    .map((t) => t.split(":").map(Number))
    .filter(([h, m]) => Number.isFinite(h) && Number.isFinite(m))
    .sort((a, b) => a[0] * 60 + a[1] - (b[0] * 60 + b[1]));
  const out: Date[] = [];
  const minStart = Date.now() + 60_000;
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  for (let d = 0; d < 365 && out.length < count; d++) {
    for (const [h, m] of parsed) {
      if (out.length >= count) break;
      const slot = new Date(day);
      slot.setDate(day.getDate() + d);
      slot.setHours(h, m, 0, 0);
      if (slot.getTime() < minStart) continue;
      if (offsetToday.has(slot.getTime())) continue;
      out.push(slot);
    }
  }
  return out;
}

export default function InstagramBatchScheduleDialog({ open, onOpenChange, videos, onDone }: Props) {
  const [selectedNets, setSelectedNets] = useState<Set<NetId>>(
    new Set(["instagram", "facebook", "youtube", "tiktok"]),
  );
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!open) { setDone(0); setErrors([]); }
  }, [open]);

  const toggleNet = (id: NetId) => setSelectedNets((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  /** Resolve credenciais e cronograma para cada projeto envolvido no lote. */
  const buildProjectBundles = async (videoRows: { id: string; project_id: string | null }[]): Promise<Map<string, ProjectBundle>> => {
    const projectIds = Array.from(new Set(videoRows.map((v) => v.project_id).filter(Boolean))) as string[];
    const map = new Map<string, ProjectBundle>();
    if (projectIds.length === 0) return map;

    // Instagram: usa a edge function segura para descobrir account por project_id.
    let igByProject = new Map<string, string>();
    try {
      const { data } = await supabase.functions.invoke("instagram-credentials", { body: { action: "get" } });
      const creds = (data?.credentials ?? {}) as Record<string, { account: string; project_id: string | null }>;
      for (const c of Object.values(creds)) {
        if (c.project_id) igByProject.set(c.project_id, c.account);
      }
    } catch { /* ignore */ }

    // Projetos (nome/categoria)
    const { data: projs } = await supabase
      .from("projects")
      .select("id, name, category")
      .in("id", projectIds);
    const projMeta = new Map<string, { name: string | null; category: string | null }>();
    for (const p of ((projs ?? []) as any[])) projMeta.set(p.id, { name: p.name ?? null, category: p.category ?? null });

    for (const pid of projectIds) {
      const meta = projMeta.get(pid) ?? { name: null, category: null };
      const igAccount = igByProject.get(pid) ?? null;
      const [ytChannel, fbAccount] = await Promise.all([
        getYoutubeChannelForProject(pid).catch(() => null),
        getFacebookAccountForProject(pid).catch(() => null),
      ]);

      // Cronograma: prioriza IG → YT → default. Reutiliza a grade já configurada.
      let times: string[] = [];
      const tryNet = async (net: ScheduleNetwork, account: string | null) => {
        if (!account || times.length) return;
        const s = await getSchedule(net, account, null).catch(() => null);
        if (s?.times?.length) times = s.times;
      };
      await tryNet("instagram", igAccount);
      await tryNet("youtube", ytChannel?.account ?? null);
      await tryNet("tiktok", igAccount);
      if (times.length === 0) times = DEFAULT_TIMES;

      map.set(pid, {
        projectId: pid,
        projectName: meta.name,
        projectCategory: meta.category,
        igAccount,
        ytChannel: ytChannel ?? null,
        fbAccount: fbAccount ?? null,
        ttAccount: igAccount, // TikTok reutiliza o slug do projeto
        times,
      });
    }
    return map;
  };

  /** Gera legenda via IA (usa mesma edge function do agendamento individual). */
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
    if (error || (data as any)?.error) throw new Error((data as any)?.error ?? error?.message ?? "Falha ao gerar legenda");
    const caption = String((data as any)?.caption ?? "").trim();
    const hashtags = flattenHashtags((data as any)?.hashtags);
    if (!caption) throw new Error("IA retornou legenda vazia");
    return { caption, hashtags };
  };

  const scheduleOne = async (
    v: VideoMeta,
    slot: Date,
    caption: string,
    hashtags: string,
    nets: NetId[],
    bundle: ProjectBundle,
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
          const description = [caption, hashtags].filter(Boolean).join("\n\n");
          await createFacebookPost({
            project_id: bundle.projectId,
            video_id: v.id,
            description,
            publish_now: false,
            scheduled_at: iso,
          });
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
            caption: tt.caption,
            status: "AGENDADO", scheduled_at: iso,
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

  const run = async () => {
    const nets = Array.from(selectedNets);
    if (nets.length === 0) { toast.error("Selecione ao menos uma rede."); return; }
    if (videos.length === 0) return;
    if (!confirm(`Agendar ${videos.length} vídeo(s) automaticamente em ${nets.length} rede(s)?`)) return;

    setBusy(true); setDone(0); setErrors([]);
    const allErrs: string[] = [];

    try {
      // Carrega project_id de cada vídeo (ordem mantida).
      const ids = videos.map((v) => v.id);
      const { data: rows } = await supabase.from("videos").select("id, project_id").in("id", ids);
      const projectByVideo = new Map<string, string | null>();
      for (const r of ((rows ?? []) as any[])) projectByVideo.set(r.id, r.project_id ?? null);

      const videoRows = videos.map((v) => ({ id: v.id, project_id: projectByVideo.get(v.id) ?? null }));
      const bundles = await buildProjectBundles(videoRows);

      // Contador de vídeos já agendados por projeto → posição no cronograma.
      const perProjectCount = new Map<string, number>();
      // Cache de slots pré-calculados por projeto.
      const slotCache = new Map<string, Date[]>();

      for (let i = 0; i < videos.length; i++) {
        const v = videos[i];
        const pid = projectByVideo.get(v.id) ?? null;
        if (!pid) { allErrs.push(`Vídeo ${i + 1} (${v.filename ?? v.id}): sem projeto vinculado`); setDone(i + 1); continue; }
        const bundle = bundles.get(pid);
        if (!bundle) { allErrs.push(`Vídeo ${i + 1} (${v.filename ?? v.id}): projeto sem configuração`); setDone(i + 1); continue; }

        // Total de vídeos deste projeto no lote → dimensiona a lista de slots.
        if (!slotCache.has(pid)) {
          const total = videoRows.filter((r) => r.project_id === pid).length;
          slotCache.set(pid, buildSlotsFromTimes(bundle.times, total));
        }
        const idx = perProjectCount.get(pid) ?? 0;
        const slot = slotCache.get(pid)![idx];
        perProjectCount.set(pid, idx + 1);

        if (!slot) {
          allErrs.push(`Vídeo ${i + 1} (${v.filename ?? v.id}): sem slot disponível no cronograma`);
          setDone(i + 1); continue;
        }

        try {
          const { caption, hashtags } = await genCaption(
            { ...v, project_id: pid },
            { name: bundle.projectName, category: bundle.projectCategory },
          );
          const errs = await scheduleOne(v, slot, caption, hashtags, nets, bundle);
          errs.forEach((e) => allErrs.push(`Vídeo ${i + 1} (${v.filename ?? v.id}): ${e}`));
        } catch (e: any) {
          allErrs.push(`Vídeo ${i + 1} (${v.filename ?? v.id}): legenda não gerada — ${e?.message ?? "erro"}`);
        }
        setDone(i + 1);
      }
    } catch (e: any) {
      allErrs.push(e?.message ?? "Falha inesperada");
    }

    setErrors(allErrs);
    setBusy(false);
    if (allErrs.length === 0) {
      toast.success(`${videos.length} vídeo(s) agendados em ${Array.from(selectedNets).length} rede(s)`);
      onOpenChange(false);
      onDone?.();
    } else {
      toast.warning(`Concluído com ${allErrs.length} erro(s).`);
      onDone?.();
    }
  };

  const progress = videos.length ? Math.round((done / videos.length) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock size={16} className="text-gold" /> Publicação em Lote
          </DialogTitle>
          <DialogDescription>
            {videos.length} vídeo(s) serão distribuídos automaticamente no cronograma de cada projeto.
          </DialogDescription>
        </DialogHeader>

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
                    } ${busy ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => !busy && toggleNet(n.id)}
                      disabled={busy}
                    />
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
            <div className="max-h-40 overflow-auto rounded-md border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive space-y-0.5">
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button
            onClick={run}
            disabled={busy || videos.length === 0 || selectedNets.size === 0}
            className="bg-gold-gradient text-black"
          >
            {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <CalendarClock size={14} className="mr-1.5" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
