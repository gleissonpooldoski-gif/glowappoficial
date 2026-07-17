import { useEffect, useMemo, useState } from "react";
import { Loader2, CalendarClock, RefreshCw, Sparkles, Wand2, Hand, Lock, Instagram } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { InstagramAccount, publishInstagram, friendlyError, platformFromProject, PLATFORM_LABEL } from "@/lib/instagram";
import { findNextSlots } from "@/lib/schedules";
import { useActiveProject } from "@/context/ProjectContext";

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
  const account: InstagramAccount | null = platformFromProject(activeProject);
  const platformLabel = account ? PLATFORM_LABEL[account] : "—";
  const platformClass =
    account === "frame"
      ? "bg-blue-500/15 text-blue-300 border-blue-400/40"
      : account === "resenha"
      ? "bg-purple-500/15 text-purple-300 border-purple-400/40"
      : "bg-muted text-muted-foreground border-border";
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
    if (!account) { setSlots([]); return; }
    setSlotBusy(true);
    try {
      const startFrom = parseStart();
      if (startMode === "manual" && startFrom && startFrom.getTime() < Date.now() + 60_000) {
        toast.error("Selecione uma data/hora futura para começar.");
        setSlots([]);
        return;
      }
      const s = await findNextSlots(account, videos.length, { startFrom });
      setSlots(s);
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
  }, [open, account, videos.length, startMode, startDate, startTime]);

  const first = slots[0];
  const last = slots[slots.length - 1];
  const insufficient = slots.length < videos.length;

  const genCaption = async (v: VideoMeta) => {
    try {
      const { data, error } = await supabase.functions.invoke("generate-caption", {
        body: {
          filename: v.filename,
          templateName: v.templateName ?? null,
          projectName: v.projectName ?? null,
          projectCategory: v.projectCategory ?? null,
        },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error ?? error?.message);
      return {
        caption: String((data as any)?.caption ?? ""),
        hashtags: flattenHashtags((data as any)?.hashtags),
      };
    } catch {
      return { caption: "", hashtags: "" };
    }
  };

  const run = async () => {
    if (!account) { toast.error("Selecione um projeto ativo (Frame ou Resenha)."); return; }
    if (videos.length === 0 || slots.length === 0) return;
    if (insufficient) {
      toast.error(`Só há ${slots.length} slots livres para ${videos.length} vídeos. Adicione mais horários.`);
      return;
    }
    if (!confirm(`Estas ${videos.length} publicações serão agendadas no projeto ${platformLabel}. Confirmar?`)) return;
    setBusy(true); setDone(0); setErrors([]);
    const errs: string[] = [];
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      const slot = slots[i];
      try {
        const { caption, hashtags } = await genCaption(v);
        await publishInstagram({
          account, videoId: v.id, caption, hashtags,
          publishNow: false, scheduledAt: slot.toISOString(),
        });
      } catch (e: any) {
        errs.push(`Vídeo ${i + 1} (${v.filename ?? v.id}): ${friendlyError(e)}`);
      }
      setDone(i + 1);
    }
    setErrors(errs);
    setBusy(false);
    if (errs.length === 0) {
      toast.success(`${videos.length} vídeo(s) agendados com sucesso`);
      onOpenChange(false);
      onDone?.();
    } else {
      toast.warning(`Agendados ${videos.length - errs.length}/${videos.length}. Veja detalhes.`);
      onDone?.();
    }
  };

  const progress = videos.length ? Math.round((done / videos.length) * 100) : 0;

  const preview = useMemo(() => slots.slice(0, 10), [slots]);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock size={16} className="text-gold" /> Agendar selecionados
          </DialogTitle>
          <DialogDescription>
            Distribui automaticamente os vídeos nos próximos horários livres da grade configurada.
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
                Selecione um projeto ativo (Frame ou Resenha) no menu superior para agendar.
              </p>
            )}
          </div>

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
            {startMode === "auto" ? (
              <div className="text-[11px] text-muted-foreground">
                O sistema encontra sozinho o próximo horário livre da grade.
              </div>
            ) : (
              <>
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
                <div className="text-[11px] text-muted-foreground">
                  Este é o primeiro slot. Os próximos vídeos seguem a grade a partir daqui, pulando horários já ocupados.
                </div>
              </>
            )}
          </div>


          <div className="rounded-lg border border-border/50 bg-background/40 p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium">Resumo do lote</span>
              <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px]"
                onClick={compute} disabled={slotBusy || busy}>
                {slotBusy ? <Loader2 size={12} className="mr-1 animate-spin" /> : <RefreshCw size={12} className="mr-1" />}
                Recalcular
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <div>Vídeos: <span className="text-foreground font-medium">{videos.length}</span></div>
              <div>Slots livres: <span className={insufficient ? "text-destructive font-medium" : "text-foreground font-medium"}>{slots.length}</span></div>
              <div>Primeiro: <span className="text-foreground font-medium">{first ? fmt(first) : "—"}</span></div>
              <div>Último: <span className="text-foreground font-medium">{last ? fmt(last) : "—"}</span></div>
            </div>
            {insufficient && !slotBusy && (
              <div className="text-destructive text-[11px]">
                Adicione mais horários em Configurações → Horários de publicação.
              </div>
            )}
            {preview.length > 0 && (
              <div className="mt-2 max-h-40 overflow-auto rounded border border-border/40 divide-y divide-border/40">
                {preview.map((s, i) => (
                  <div key={i} className="flex justify-between px-2 py-1">
                    <span className="text-muted-foreground">Vídeo {i + 1}</span>
                    <span className="text-foreground">{fmt(s)}</span>
                  </div>
                ))}
                {slots.length > preview.length && (
                  <div className="px-2 py-1 text-center text-muted-foreground">
                    + {slots.length - preview.length} vídeo(s)…
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Sparkles size={11} className="text-gold" />
              Legenda e hashtags serão geradas automaticamente para cada vídeo.
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
            disabled={busy || slotBusy || videos.length === 0 || slots.length === 0 || insufficient}
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
