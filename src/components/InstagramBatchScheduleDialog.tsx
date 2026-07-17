import { useEffect, useMemo, useState } from "react";
import { Loader2, CalendarClock, RefreshCw, Sparkles, Wand2, Hand } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ACCOUNTS, InstagramAccount, publishInstagram, friendlyError } from "@/lib/instagram";
import { findNextSlots } from "@/lib/schedules";

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
  const [account, setAccount] = useState<InstagramAccount>("resenha");
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
    if (videos.length === 0 || slots.length === 0) return;
    if (insufficient) {
      toast.error(`Só há ${slots.length} slots livres para ${videos.length} vídeos. Adicione mais horários.`);
      return;
    }
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
            <Label className="text-xs">Conta</Label>
            <Select value={account} onValueChange={(v) => setAccount(v as InstagramAccount)} disabled={busy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACCOUNTS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
