import { useEffect, useState } from "react";
import { Loader2, Instagram, Youtube, Facebook, CalendarClock, Send, Sparkles, RefreshCw, Wand2, Hand, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { InstagramAccount, publishInstagram, friendlyError, useIgAccountForProject, platformLabelFor } from "@/lib/instagram";
import { uploadToYoutube, useYoutubeChannelForProject } from "@/lib/youtube";
import { findNextSlot, ScheduleNetwork, scheduleAccountFor } from "@/lib/schedules";
import { useActiveProject } from "@/context/ProjectContext";
import { extractVideoFrames } from "@/lib/videoFrames";
import { createFacebookPost, getFacebookAccountForProject, friendlyFacebookError } from "@/lib/facebook";

type NetId = "instagram" | "youtube" | "facebook";

type VideoMeta = {
  filename?: string;
  templateName?: string | null;
  projectName?: string | null;
  projectCategory?: string | null;
  videoUrl?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "now" | "schedule";
  videoId: string | null;
  defaultCaption?: string;
  defaultHashtags?: string;
  videoMeta?: VideoMeta;
  onDone?: () => void;
};

function localDateTimeToIso(date: string, time: string) {
  if (!date || !time) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
  return dt.toISOString();
}

function flattenHashtags(h: any): string {
  if (!h) return "";
  if (typeof h === "string") return h;
  const groups = [h.alcance, h.nicho, h.tema].filter(Array.isArray);
  return groups.flat().join(" ");
}

export default function InstagramPublishDialog({
  open, onOpenChange, mode, videoId, defaultCaption = "", defaultHashtags = "", videoMeta, onDone,
}: Props) {
  const { activeProject } = useActiveProject();
  const { account, displayName, loading: accLoading } = useIgAccountForProject(activeProject?.id ?? null);
  const platformLabel = platformLabelFor(account, displayName);
  const platformClass =
    account === "frame"
      ? "bg-blue-500/15 text-blue-300 border-blue-400/40"
      : account === "resenha"
      ? "bg-purple-500/15 text-purple-300 border-purple-400/40"
      : account
      ? "bg-gold/10 text-gold border-gold/40"
      : "bg-muted text-muted-foreground border-border";
  const [caption, setCaption] = useState(defaultCaption);
  const [hashtags, setHashtags] = useState(defaultHashtags);
  const now = new Date();
  const plus1h = new Date(now.getTime() + 60 * 60 * 1000);
  const [date, setDate] = useState(plus1h.toISOString().slice(0, 10));
  const [time, setTime] = useState(plus1h.toTimeString().slice(0, 5));
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<"auto" | "manual">("auto");
  const [slotBusy, setSlotBusy] = useState(false);
  const [autoSlot, setAutoSlot] = useState<Date | null>(null);
  const [nets, setNets] = useState<Set<NetId>>(new Set(["instagram"]));
  const { account: ytAccount, channelTitle: ytChannelTitle, loading: ytLoading } = useYoutubeChannelForProject(activeProject?.id ?? null);
  const [hasVideoFile, setHasVideoFile] = useState<boolean | null>(null);
  const [fbAccount, setFbAccount] = useState<{ id: string; page_id: string; page_name: string | null; page_picture: string | null } | null>(null);
  const toggleNet = (n: NetId) => setNets((prev) => {
    const s = new Set(prev);
    if (n === "youtube" && !s.has("youtube") && hasVideoFile === false) {
      toast.error("Para publicar no YouTube, adicione um vídeo ao post.");
      return prev;
    }
    if (n === "youtube" && !s.has("youtube") && !ytAccount) {
      toast.error("Este projeto não tem um canal do YouTube vinculado. Configure em Configurações → YouTube.");
      return prev;
    }
    if (n === "facebook" && !s.has("facebook") && !fbAccount) {
      toast.error("Este projeto não tem uma Página do Facebook conectada. Configure em Configurações → Facebook.");
      return prev;
    }
    if (s.has(n)) s.delete(n); else s.add(n);
    if (s.size === 0) s.add(n); // sempre pelo menos 1
    return s;
  });

  // Verifica se o vídeo tem arquivo (original ou processado) para habilitar YouTube.
  useEffect(() => {
    if (!open || !videoId) { setHasVideoFile(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("videos")
        .select("original_path, processed_path")
        .eq("id", videoId)
        .maybeSingle();
      if (cancelled) return;
      const ok = Boolean((data as any)?.original_path || (data as any)?.processed_path);
      setHasVideoFile(ok);
      if (!ok) {
        setNets((prev) => {
          if (!prev.has("youtube")) return prev;
          const s = new Set(prev); s.delete("youtube");
          if (s.size === 0) s.add("instagram");
          return s;
        });
      }
    })();
    return () => { cancelled = true; };
  }, [open, videoId]);

  // Carrega Página do Facebook vinculada ao projeto ativo.
  useEffect(() => {
    if (!open || !activeProject?.id) { setFbAccount(null); return; }
    let cancelled = false;
    (async () => {
      const acc = await getFacebookAccountForProject(activeProject.id);
      if (!cancelled) setFbAccount(acc);
    })();
    return () => { cancelled = true; };
  }, [open, activeProject?.id]);


  // Auto-gera legenda/hashtags ao abrir se não vieram prontos
  useEffect(() => {
    if (!open || !videoId) return;
    setCaption(defaultCaption);
    setHashtags(defaultHashtags);
    if (!defaultCaption && !defaultHashtags && videoMeta) {
      void generate(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, videoId]);

  // Ao abrir em modo agendar (ou quando trocar redes/conta), calcula próximo slot POR REDE
  useEffect(() => {
    if (!open || mode !== "schedule" || scheduleMode !== "auto") return;
    void computeAutoSlot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, scheduleMode, account, nets]);

  const computeAutoSlot = async () => {
    setSlotBusy(true);
    try {
      const results: { instagram: Date | null; youtube: Date | null } = { instagram: null, youtube: null };
      await Promise.all(
        (["instagram", "youtube"] as const).map(async (net) => {
          if (!nets.has(net)) return;
          const acc = scheduleAccountFor(net, account);
          if (!acc) return;
          try {
            results[net] = await findNextSlot(net as ScheduleNetwork, acc);
          } catch { /* ignore */ }
        }),
      );
      setAutoSlots(results);
      // Preenche date/time visíveis com o primeiro slot disponível (para exibição/manual)
      const first = results.instagram ?? results.youtube;
      if (first) {
        setDate(`${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}-${String(first.getDate()).padStart(2, "0")}`);
        setTime(first.toTimeString().slice(0, 5));
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setSlotBusy(false);
    }
  };

  const generate = async (silent = false) => {
    if (!videoMeta) return;
    setGenBusy(true);
    try {
      const frames = videoMeta.videoUrl ? await extractVideoFrames(videoMeta.videoUrl, 4).catch(() => []) : [];
      const { data, error } = await supabase.functions.invoke("generate-caption", {
        body: {
          filename: videoMeta.filename,
          templateName: videoMeta.templateName ?? null,
          projectName: videoMeta.projectName ?? null,
          projectCategory: videoMeta.projectCategory ?? null,
          frames,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setCaption(String((data as any)?.caption ?? ""));
      setHashtags(flattenHashtags((data as any)?.hashtags));
      if (!silent) {
        if ((data as any)?.validated === false) toast.warning("Gerada, mas revise: validação apontou possíveis inconsistências.");
        else toast.success("Nova opção gerada");
      }
    } catch (e: any) {
      if (!silent) toast.error(e?.message ?? "Falha ao gerar legenda");
    } finally {
      setGenBusy(false);
    }
  };

  const regenerateHashtags = async (silent = false) => {
    if (!videoMeta) return;
    setGenBusy(true);
    try {
      const frames = videoMeta.videoUrl ? await extractVideoFrames(videoMeta.videoUrl, 4).catch(() => []) : [];
      const { data, error } = await supabase.functions.invoke("generate-caption", {
        body: {
          filename: videoMeta.filename,
          templateName: videoMeta.templateName ?? null,
          projectName: videoMeta.projectName ?? null,
          projectCategory: videoMeta.projectCategory ?? null,
          frames,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setHashtags(flattenHashtags((data as any)?.hashtags));
      if (!silent) toast.success("Novas hashtags geradas");
    } catch (e: any) {
      if (!silent) toast.error(e?.message ?? "Falha ao gerar hashtags");
    } finally {
      setGenBusy(false);
    }
  };

  const submit = async () => {
    if (!videoId) { toast.error("Vídeo inválido."); return; }
    const wantIG = nets.has("instagram");
    const wantYT = nets.has("youtube");
    const wantFB = nets.has("facebook");
    if (!wantIG && !wantYT && !wantFB) { toast.error("Selecione ao menos uma rede."); return; }
    if (wantIG && !account) {
      toast.error("Este projeto não tem uma conta do Instagram vinculada. Cadastre em Configurações → Instagram.");
      return;
    }
    if (wantYT && hasVideoFile === false) {
      toast.error("Para publicar no YouTube, adicione um vídeo ao post.");
      return;
    }
    if (wantFB && !fbAccount) {
      toast.error("Este projeto não tem uma Página do Facebook vinculada. Conecte em Configurações → Facebook.");
      return;
    }
    if (wantFB && hasVideoFile === false) {
      toast.error("Para publicar no Facebook, adicione um vídeo ao post.");
      return;
    }
    if (!caption.trim()) {
      toast.error("Legenda vazia. Gere a legenda automaticamente ou escreva manualmente antes de publicar.");
      return;
    }
    const netsLabel = [wantIG && "Instagram", wantFB && "Facebook", wantYT && "YouTube"].filter(Boolean).join(" + ");
    const confirmMsg =
      mode === "schedule"
        ? `Agendar em ${netsLabel}. Confirmar?`
        : `Publicar agora em ${netsLabel}. Confirmar?`;
    if (!confirm(confirmMsg)) return;
    setBusy(true);
    try {
      // Modo schedule: cada rede pode ter seu próprio horário (modo auto) ou o mesmo (modo manual).
      const manualIso = mode === "schedule" ? localDateTimeToIso(date, time) : null;
      const igIso = mode === "schedule"
        ? (scheduleMode === "auto" ? (autoSlots.instagram?.toISOString() ?? null) : manualIso)
        : null;
      const ytIso = mode === "schedule"
        ? (scheduleMode === "auto" ? (autoSlots.youtube?.toISOString() ?? null) : manualIso)
        : null;
      // Facebook usa o slot do Instagram (mesma cadência da conta) ou fallback manual/YT.
      const fbIso = mode === "schedule" ? (igIso ?? ytIso ?? manualIso) : null;
      if (mode === "schedule") {
        if (wantIG && (!igIso || new Date(igIso).getTime() < Date.now() + 60_000)) {
          throw new Error("Instagram: horário indisponível. Configure a grade em Configurações.");
        }
        if (wantYT && (!ytIso || new Date(ytIso).getTime() < Date.now() + 60_000)) {
          throw new Error("YouTube: horário indisponível. Configure a grade em Configurações.");
        }
        if (wantFB && (!fbIso || new Date(fbIso).getTime() < Date.now() + 60_000)) {
          throw new Error("Facebook: horário indisponível.");
        }
      }
      let igPostId: string | null = null;
      let ytPostId: string | null = null;
      let fbPostId: string | null = null;
      const errs: string[] = [];

      if (wantIG && account) {
        try {
          if (mode === "schedule") {
            const res: any = await publishInstagram({ account, videoId, caption, hashtags, publishNow: false, scheduledAt: igIso! });
            igPostId = res?.post?.id ?? null;
          } else {
            toast.message("Enviando para o Instagram…");
            const res: any = await publishInstagram({ account, videoId, caption, hashtags, publishNow: true });
            igPostId = res?.post?.id ?? null;
          }
        } catch (e: any) { errs.push(`Instagram: ${friendlyError(e)}`); }
      }

      if (wantYT) {
        if (!ytAccount) {
          errs.push("YouTube: nenhum canal vinculado ao projeto atual. Vincule em Configurações → YouTube.");
        } else {
          try {
            // Extrai hashtags da legenda + campo hashtags. Título nunca usa nome do arquivo.
            const captionRaw = caption ?? "";
            const hashtagsFromCaption = (captionRaw.match(/#[\p{L}\p{N}_]+/gu) ?? []) as string[];
            const hashtagsFromField = (hashtags ?? "").split(/\s+/).filter((s) => s.startsWith("#"));
            const allHashtags = Array.from(new Set([...hashtagsFromCaption, ...hashtagsFromField]));
            const captionNoTags = captionRaw.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim();

            // Gera título via IA a partir da legenda (sem hashtags, sem nome do arquivo).
            let title = "";
            try {
              const { data: t, error: tErr } = await supabase.functions.invoke("generate-youtube-title", {
                body: {
                  caption: captionNoTags,
                  projectName: videoMeta?.projectName ?? null,
                  projectCategory: videoMeta?.projectCategory ?? null,
                },
              });
              if (!tErr) title = String((t as any)?.title ?? "").trim();
            } catch { /* fallback abaixo */ }
            if (!title) {
              title = (captionNoTags.split(/[.!?\n]/)[0] || captionNoTags || videoMeta?.projectName || "Novo vídeo").trim();
            }
            title = title.replace(/#[\p{L}\p{N}_]+/gu, "").trim().slice(0, 100);

            // Descrição: legenda (limpa) + hashtags no final.
            const desc = [captionNoTags, allHashtags.join(" ")].filter(Boolean).join("\n\n").slice(0, 5000);
            // Tags: hashtags extraídas (sem #), até 15.
            const tags = allHashtags.map((t) => t.replace(/^#/, "")).filter(Boolean).slice(0, 15);

            try {
              if (mode === "schedule") {
                const { data, error } = await supabase.from("youtube_posts" as any).insert({
                  video_id: videoId, account: ytAccount,
                  title, description: desc, tags,
                  category_id: "22", privacy_status: "public",
                  status: "AGENDADO", scheduled_at: ytIso,
                }).select("id").maybeSingle();
                if (error) throw error;
                ytPostId = (data as any)?.id ?? null;
              } else {
                toast.message("Enviando para o YouTube…");
                await uploadToYoutube({
                  account: ytAccount, video_id: videoId,
                  title, description: desc, tags,
                  category_id: "22", privacy_status: "public",
                });
              }
            } catch (e: any) {
              errs.push(`YouTube: ${e?.message ?? "erro"}`);
            }
          } catch (e: any) { errs.push(`YouTube: ${e?.message ?? "erro"}`); }
        }
      }

      // === FACEBOOK (independente: erros não afetam IG/YT) ===
      if (wantFB && fbAccount && activeProject?.id) {
        try {
          if (mode === "schedule") {
            const res: any = await createFacebookPost({
              project_id: activeProject.id, video_id: videoId,
              description: [caption, hashtags].filter(Boolean).join("\n\n"),
              publish_now: false, scheduled_at: fbIso!,
            });
            fbPostId = res?.post?.id ?? null;
          } else {
            toast.message("Enviando para o Facebook…");
            const res: any = await createFacebookPost({
              project_id: activeProject.id, video_id: videoId,
              description: [caption, hashtags].filter(Boolean).join("\n\n"),
              publish_now: true,
            });
            fbPostId = res?.post?.id ?? null;
          }
        } catch (e: any) { errs.push(`Facebook: ${friendlyFacebookError(e)}`); }
      }

      // Registro consolidado por rede (para o calendário exibir os ícones).
      if (mode === "schedule") {
        const rows: any[] = [];
        if (wantIG && igIso) rows.push({
          video_id: videoId, networks: ["instagram"], scheduled_at: igIso,
          instagram_post_id: igPostId, youtube_post_id: null, tiktok_post_id: null,
        });
        if (wantYT && ytIso) rows.push({
          video_id: videoId, networks: ["youtube"], scheduled_at: ytIso,
          instagram_post_id: null, youtube_post_id: ytPostId, tiktok_post_id: null,
        });
        if (wantFB && fbIso) rows.push({
          video_id: videoId, networks: ["facebook"], scheduled_at: fbIso,
          instagram_post_id: null, youtube_post_id: null, tiktok_post_id: null,
        });
        if (rows.length) {
          try { await supabase.from("publish_schedules_multi" as any).insert(rows); } catch { /* não bloqueia */ }
        }
      }

      if (errs.length === 0) {
        toast.success(mode === "schedule" ? "Publicação agendada!" : "Publicação iniciada. Acompanhe em Publicações.");
        onOpenChange(false);
        onDone?.();
      } else {
        toast.warning(`Concluído com erros: ${errs.join(" | ")}`);
        onDone?.();
      }
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Instagram size={16} className="text-gold" />
            {mode === "now" ? "Publicar agora" : "Agendar publicação"}
          </DialogTitle>
          <DialogDescription>
            {mode === "now"
              ? "O Reel será enviado imediatamente ao Instagram."
              : "Defina data e hora — a publicação acontecerá automaticamente."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Redes sociais</Label>
            <div className="grid grid-cols-2 gap-2">
              <label className={`flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs cursor-pointer transition-colors ${
                nets.has("instagram") ? "border-gold/50 bg-gold/5" : "border-border/60 bg-background/30 hover:bg-background/60"
              }`}>
                <Checkbox checked={nets.has("instagram")} onCheckedChange={() => toggleNet("instagram")} disabled={busy} />
                <Instagram size={14} className="text-pink-400" />
                <span className="flex-1">Instagram</span>
              </label>
              <label
                title={hasVideoFile === false ? "Para publicar no YouTube, adicione um vídeo ao post." : undefined}
                className={`flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors ${
                  nets.has("youtube") ? "border-gold/50 bg-gold/5" : "border-border/60 bg-background/30 hover:bg-background/60"
                } ${hasVideoFile === false ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <Checkbox
                  checked={nets.has("youtube")}
                  onCheckedChange={() => toggleNet("youtube")}
                  disabled={busy || hasVideoFile === false}
                />
                <Youtube size={14} className="text-red-400" />
                <span className="flex-1">YouTube</span>
              </label>
              <label
                title={!fbAccount ? "Conecte uma Página do Facebook em Configurações → Facebook." : undefined}
                className={`flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors ${
                  nets.has("facebook") ? "border-gold/50 bg-gold/5" : "border-border/60 bg-background/30 hover:bg-background/60"
                } ${!fbAccount || hasVideoFile === false ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <Checkbox
                  checked={nets.has("facebook")}
                  onCheckedChange={() => toggleNet("facebook")}
                  disabled={busy || !fbAccount || hasVideoFile === false}
                />
                <Facebook size={14} className="text-blue-400" />
                <span className="flex-1">Facebook</span>
              </label>
            </div>
            {hasVideoFile === false && (
              <p className="text-[11px] text-muted-foreground">
                Para publicar no YouTube ou Facebook, adicione um vídeo ao post.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1"><Lock size={10} /> Publicando em</Label>
            <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2 space-y-1.5">
              {nets.has("instagram") && (
                <div className="flex items-center gap-2">
                  <Instagram size={14} className={account === "frame" ? "text-blue-300" : account === "resenha" ? "text-purple-300" : "text-pink-400"} />
                  <Badge variant="outline" className={`text-[10px] font-semibold ${platformClass}`}>
                    📱 Instagram · {platformLabel}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground ml-1">
                    {activeProject ? `Projeto: ${activeProject.name}` : "Nenhum projeto ativo"}
                  </span>
                </div>
              )}
              {nets.has("youtube") && (
                <div className="flex items-center gap-2">
                  <Youtube size={14} className="text-red-400" />
                  <Badge variant="outline" className="text-[10px] font-semibold bg-red-500/15 text-red-300 border-red-400/40">
                    ▶️ YouTube · {ytChannelTitle ?? (ytLoading ? "carregando…" : ytAccount ?? "sem canal vinculado")}
                  </Badge>
                  {!ytAccount && !ytLoading && (
                    <span className="text-[11px] text-destructive">Vincule um canal em Configurações → YouTube.</span>
                  )}
                </div>
              )}
              {nets.has("facebook") && (
                <div className="flex items-center gap-2">
                  <Facebook size={14} className="text-blue-400" />
                  {fbAccount?.page_picture && (
                    <img src={fbAccount.page_picture} alt="" className="h-4 w-4 rounded-full object-cover" />
                  )}
                  <Badge variant="outline" className="text-[10px] font-semibold bg-blue-500/15 text-blue-300 border-blue-400/40">
                    📘 Facebook · {fbAccount?.page_name ?? "Página"}
                  </Badge>
                </div>
              )}
              {nets.size === 0 && (
                <span className="text-[11px] text-muted-foreground">Selecione ao menos uma rede acima.</span>
              )}
            </div>
            {nets.has("instagram") && !account && !accLoading && (
              <p className="text-[11px] text-destructive">
                Este projeto ainda não tem uma conta do Instagram vinculada. Vá em Configurações → Instagram para conectar.
              </p>
            )}
          </div>

          {nets.has("youtube") && (
            <div className="flex items-start gap-2 rounded-md border border-red-400/30 bg-red-500/5 px-3 py-2 text-[11px] text-red-200">
              <Youtube size={12} className="mt-0.5 shrink-0" />
              <span>
                Título, descrição e tags do YouTube são gerados automaticamente a partir da legenda do post — o nome do arquivo nunca é usado.
              </span>
            </div>
          )}




          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Legenda</Label>
              {videoMeta && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-[11px] text-gold hover:bg-gold/10"
                  onClick={() => generate(false)}
                  disabled={genBusy || busy}
                >
                  {genBusy
                    ? <Loader2 size={12} className="animate-spin" />
                    : <RefreshCw size={12} />}
                  Gerar outra opção
                </Button>
              )}
            </div>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              placeholder={genBusy ? "Gerando legenda…" : "Escreva a legenda do Reel…"}
              disabled={genBusy}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Hashtags</Label>
              {videoMeta && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-[11px] text-gold hover:bg-gold/10"
                  onClick={() => regenerateHashtags(false)}
                  disabled={genBusy || busy}
                >
                  {genBusy
                    ? <Loader2 size={12} className="animate-spin" />
                    : <RefreshCw size={12} />}
                  Gerar outras hashtags
                </Button>
              )}
            </div>
            <Textarea
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              rows={3}
              placeholder={genBusy ? "Gerando hashtags…" : "#reels #viral #skincare"}
              disabled={genBusy}
            />
          </div>

          {mode === "schedule" && (
            <div className="space-y-2 rounded-lg border border-border/50 bg-background/40 p-3">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={scheduleMode === "auto" ? "default" : "ghost"}
                  className={scheduleMode === "auto" ? "bg-gold-gradient text-black h-8" : "h-8"}
                  onClick={() => setScheduleMode("auto")}
                >
                  <Wand2 size={12} className="mr-1" /> Automático
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={scheduleMode === "manual" ? "default" : "ghost"}
                  className={scheduleMode === "manual" ? "bg-gold-gradient text-black h-8" : "h-8"}
                  onClick={() => setScheduleMode("manual")}
                >
                  <Hand size={12} className="mr-1" /> Manual
                </Button>
                {scheduleMode === "auto" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-8 text-[11px]"
                    onClick={computeAutoSlot}
                    disabled={slotBusy}
                  >
                    {slotBusy ? <Loader2 size={12} className="mr-1 animate-spin" /> : <RefreshCw size={12} className="mr-1" />}
                    Recalcular
                  </Button>
                )}
              </div>

              {scheduleMode === "auto" ? (
                <div className="space-y-1 text-xs text-muted-foreground">
                  {slotBusy && <div>Buscando próximos slots por rede…</div>}
                  {!slotBusy && (
                    <>
                      {nets.has("instagram") && (
                        <div className="flex items-center gap-2">
                          <Instagram size={11} className="text-pink-400" />
                          <span>Instagram:</span>
                          <span className="text-foreground font-medium">
                            {autoSlots.instagram
                              ? autoSlots.instagram.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
                              : "grade não configurada"}
                          </span>
                        </div>
                      )}
                      {nets.has("youtube") && (
                        <div className="flex items-center gap-2">
                          <Youtube size={11} className="text-red-400" />
                          <span>YouTube:</span>
                          <span className="text-foreground font-medium">
                            {autoSlots.youtube
                              ? autoSlots.youtube.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
                              : "grade não configurada"}
                          </span>
                        </div>
                      )}
                      {!autoSlots.instagram && !autoSlots.youtube && (
                        <div className="text-destructive">
                          Nenhum horário configurado. Vá em Configurações → Horários de publicação.
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Data</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Hora</Label>
                    <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          )}

          {genBusy && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Sparkles size={11} className="text-gold" />
              Gerando sugestão de legenda e hashtags…
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={busy || genBusy || (nets.has("instagram") && !account)} className="bg-gold-gradient text-black">
            {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> :
              mode === "now" ? <Send size={14} className="mr-1.5" /> : <CalendarClock size={14} className="mr-1.5" />}
            {mode === "now" ? "Publicar" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
