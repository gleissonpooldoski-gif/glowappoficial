import { useEffect, useState } from "react";
import { Loader2, Instagram, CalendarClock, Send, Sparkles, RefreshCw, Wand2, Hand, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { InstagramAccount, publishInstagram, friendlyError, platformFromProject, PLATFORM_LABEL } from "@/lib/instagram";
import { findNextSlot } from "@/lib/schedules";
import { useActiveProject } from "@/context/ProjectContext";

type VideoMeta = {
  filename?: string;
  templateName?: string | null;
  projectName?: string | null;
  projectCategory?: string | null;
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
      const { data, error } = await supabase.functions.invoke("generate-caption", {
        body: {
          filename: videoMeta.filename,
          templateName: videoMeta.templateName ?? null,
          projectName: videoMeta.projectName ?? null,
          projectCategory: videoMeta.projectCategory ?? null,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setCaption(String((data as any)?.caption ?? ""));
      setHashtags(flattenHashtags((data as any)?.hashtags));
      if (!silent) toast.success("Nova opção gerada");
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
      const { data, error } = await supabase.functions.invoke("generate-caption", {
        body: {
          filename: videoMeta.filename,
          templateName: videoMeta.templateName ?? null,
          projectName: videoMeta.projectName ?? null,
          projectCategory: videoMeta.projectCategory ?? null,
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
    if (!account) {
      toast.error("Selecione um projeto ativo (Frame ou Resenha) no menu superior.");
      return;
    }
    const confirmMsg =
      mode === "schedule"
        ? `Esta publicação será agendada no projeto ${platformLabel}. Confirmar?`
        : `Esta publicação será enviada agora ao ${platformLabel}. Confirmar?`;
    if (!confirm(confirmMsg)) return;
    setBusy(true);
    try {
      if (mode === "schedule") {
        const iso = localDateTimeToIso(date, time);
        if (!iso || new Date(iso).getTime() < Date.now() + 60_000) {
          throw new Error("Selecione uma data/hora futura (mín. 1 minuto).");
        }
        await publishInstagram({ account, videoId, caption, hashtags, publishNow: false, scheduledAt: iso });
        toast.success("Publicação agendada!");
      } else {
        toast.message("Enviando para o Instagram… isso pode levar alguns minutos.");
        await publishInstagram({ account, videoId, caption, hashtags, publishNow: true });
        toast.success("Publicação iniciada. Acompanhe o status em Publicações.");
      }
      onOpenChange(false);
      onDone?.();
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
            <Label className="text-xs flex items-center gap-1"><Lock size={10} /> Publicando em</Label>
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2">
              <Instagram size={14} className={account === "frame" ? "text-blue-300" : account === "resenha" ? "text-purple-300" : "text-muted-foreground"} />
              <Badge variant="outline" className={`text-[10px] font-semibold ${platformClass}`}>
                📱 {platformLabel}
              </Badge>
              <span className="text-[11px] text-muted-foreground ml-1">
                {activeProject ? `Projeto ativo: ${activeProject.name}` : "Nenhum projeto ativo selecionado"}
              </span>
            </div>
            {!account && (
              <p className="text-[11px] text-destructive">
                Selecione um projeto ativo (Frame ou Resenha) no menu superior para publicar.
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
          <Button onClick={submit} disabled={busy || genBusy || !account} className="bg-gold-gradient text-black">
            {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> :
              mode === "now" ? <Send size={14} className="mr-1.5" /> : <CalendarClock size={14} className="mr-1.5" />}
            {mode === "now" ? "Publicar" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
