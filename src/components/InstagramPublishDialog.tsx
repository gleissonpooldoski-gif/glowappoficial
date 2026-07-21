import { useEffect, useState } from "react";
import { Loader2, Instagram, Youtube, CalendarClock, Send, Sparkles, RefreshCw, Wand2, Hand, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { InstagramAccount, publishInstagram, friendlyError, platformFromProject, PLATFORM_LABEL } from "@/lib/instagram";
import { uploadToYoutube } from "@/lib/youtube";
import { findNextSlot } from "@/lib/schedules";
import { useActiveProject } from "@/context/ProjectContext";
import { extractVideoFrames } from "@/lib/videoFrames";

type NetId = "instagram" | "youtube";

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
  const account: InstagramAccount | null = platformFromProject(activeProject);
  const platformLabel = account ? PLATFORM_LABEL[account] : "—";
  const platformClass =
    account === "frame"
      ? "bg-blue-500/15 text-blue-300 border-blue-400/40"
      : account === "resenha"
      ? "bg-purple-500/15 text-purple-300 border-purple-400/40"
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
  const [hasVideoFile, setHasVideoFile] = useState<boolean | null>(null);
  const toggleNet = (n: NetId) => setNets((prev) => {
    const s = new Set(prev);
    if (n === "youtube" && !s.has("youtube") && hasVideoFile === false) {
      toast.error("Para publicar no YouTube, adicione um vídeo ao post.");
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

  // Ao abrir em modo agendar OU quando trocar conta em modo auto, calcula próximo slot
  useEffect(() => {
    if (!open || mode !== "schedule" || scheduleMode !== "auto") return;
    void computeAutoSlot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, scheduleMode, account]);

  const computeAutoSlot = async () => {
    if (!account) return;
    setSlotBusy(true);
    try {
      const slot = await findNextSlot(account);
      setAutoSlot(slot);
      if (slot) {
        setDate(`${slot.getFullYear()}-${String(slot.getMonth() + 1).padStart(2, "0")}-${String(slot.getDate()).padStart(2, "0")}`);
        setTime(slot.toTimeString().slice(0, 5));
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
    if (!wantIG && !wantYT) { toast.error("Selecione ao menos uma rede."); return; }
    if (wantIG && !account) {
      toast.error("Selecione um projeto ativo (Frame ou Resenha) para publicar no Instagram.");
      return;
    }
    if (wantYT && hasVideoFile === false) {
      toast.error("Para publicar no YouTube, adicione um vídeo ao post.");
      return;
    }
    const netsLabel = [wantIG && "Instagram", wantYT && "YouTube"].filter(Boolean).join(" + ");
    const confirmMsg =
      mode === "schedule"
        ? `Agendar em ${netsLabel}. Confirmar?`
        : `Publicar agora em ${netsLabel}. Confirmar?`;
    if (!confirm(confirmMsg)) return;
    setBusy(true);
    try {
      let iso: string | null = null;
      if (mode === "schedule") {
        iso = localDateTimeToIso(date, time);
        if (!iso || new Date(iso).getTime() < Date.now() + 60_000) {
          throw new Error("Selecione uma data/hora futura (mín. 1 minuto).");
        }
      }
      let igPostId: string | null = null;
      let ytPostId: string | null = null;
      const errs: string[] = [];

      if (wantIG && account) {
        try {
          if (mode === "schedule") {
            const res: any = await publishInstagram({ account, videoId, caption, hashtags, publishNow: false, scheduledAt: iso! });
            igPostId = res?.post?.id ?? null;
          } else {
            toast.message("Enviando para o Instagram…");
            const res: any = await publishInstagram({ account, videoId, caption, hashtags, publishNow: true });
            igPostId = res?.post?.id ?? null;
          }
        } catch (e: any) { errs.push(`Instagram: ${friendlyError(e)}`); }
      }

      if (wantYT) {
        try {
          const title = (videoMeta?.filename ?? caption ?? "Vídeo").replace(/\.[^.]+$/, "").slice(0, 100) || "Vídeo";
          const desc = [caption, hashtags].filter(Boolean).join("\n\n").slice(0, 5000);
          const tags = hashtags.split(/\s+/).map((t) => t.replace(/^#/, "")).filter(Boolean).slice(0, 15);
          if (mode === "schedule") {
            const { data, error } = await supabase.from("youtube_posts" as any).insert({
              video_id: videoId, account: "default",
              title, description: desc, tags,
              category_id: "22", privacy_status: "public",
              status: "AGENDADO", scheduled_at: iso,
            }).select("id").maybeSingle();
            if (error) throw error;
            ytPostId = (data as any)?.id ?? null;
          } else {
            toast.message("Enviando para o YouTube…");
            await uploadToYoutube({
              account: "default", video_id: videoId,
              title, description: desc, tags,
              category_id: "22", privacy_status: "public",
            });
          }
        } catch (e: any) { errs.push(`YouTube: ${e?.message ?? "erro"}`); }
      }

      // Registro consolidado (para o calendário exibir os ícones)
      if (mode === "schedule" && iso) {
        try {
          await supabase.from("publish_schedules_multi" as any).insert({
            video_id: videoId,
            networks: Array.from(nets),
            scheduled_at: iso,
            instagram_post_id: igPostId,
            youtube_post_id: ytPostId,
            tiktok_post_id: null,
          });
        } catch { /* não bloqueia */ }
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
            </div>
            {hasVideoFile === false && (
              <p className="text-[11px] text-muted-foreground">
                Para publicar no YouTube, adicione um vídeo ao post.
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
                    ▶️ YouTube · Canal principal
                  </Badge>
                </div>
              )}
              {nets.size === 0 && (
                <span className="text-[11px] text-muted-foreground">Selecione ao menos uma rede acima.</span>
              )}
            </div>
            {nets.has("instagram") && !account && (
              <p className="text-[11px] text-destructive">
                Selecione um projeto ativo (Frame ou Resenha) no menu superior para publicar no Instagram.
              </p>
            )}
          </div>


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
                <div className="text-xs text-muted-foreground">
                  {slotBusy && "Buscando próximo espaço livre…"}
                  {!slotBusy && autoSlot && (
                    <>Próximo slot: <span className="text-foreground font-medium">
                      {autoSlot.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </span></>
                  )}
                  {!slotBusy && !autoSlot && (
                    <span className="text-destructive">
                      Nenhum horário configurado. Vá em Configurações → Horários de publicação.
                    </span>
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
