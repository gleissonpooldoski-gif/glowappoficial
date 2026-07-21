import { useEffect, useState } from "react";
import { Clock, Plus, Trash2, Save, Loader2, CalendarClock, RotateCcw, Sparkles, Instagram, Youtube, CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ACCOUNTS } from "@/lib/instagram";
import {
  DEFAULT_TIMES,
  PublishSchedule,
  ScheduleNetwork,
  getSchedule,
  upsertSchedule,
  findNextSlot,
  findNextSlots,
} from "@/lib/schedules";
import TimeInput from "@/components/TimeInput";

function formatDateTimeBR(d: Date) {
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function toLocalInputValue(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function ScheduleEditor({
  network,
  account,
  label,
  defaultTimes = DEFAULT_TIMES,
  defaultPerDay = 5,
}: {
  network: ScheduleNetwork;
  account: string;
  label: string;
  defaultTimes?: string[];
  defaultPerDay?: number;
}) {
  const [times, setTimes] = useState<string[]>(defaultTimes);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seqDate, setSeqDate] = useState("");
  const [seqTime, setSeqTime] = useState("");
  const [seqStartAt, setSeqStartAt] = useState<string | null>(null);
  const [nextSlot, setNextSlot] = useState<Date | null>(null);
  const [preview, setPreview] = useState<Date[]>([]);

  const loadNextSlot = async () => {
    try {
      const [n, arr] = await Promise.all([
        findNextSlot(network, account),
        findNextSlots(network, account, 6),
      ]);
      setNextSlot(n);
      setPreview(arr);
    } catch {
      setNextSlot(null);
      setPreview([]);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const sched: PublishSchedule | null = await getSchedule(network, account, null);
        if (sched) {
          setTimes(sched.times.length ? sched.times : defaultTimes);
          setSeqStartAt(sched.sequence_start_at);
          const { date, time } = toLocalInputValue(sched.sequence_start_at);
          setSeqDate(date);
          setSeqTime(time);
        }
        await loadNextSlot();
      } catch (e: any) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, account]);

  const add = () => {
    if (!/^\d{1,2}:\d{2}$/.test(newTime)) return toast.error("Formato HH:MM");
    const [h, m] = newTime.split(":").map(Number);
    if (h < 0 || h > 23 || m < 0 || m > 59) return toast.error("Horário inválido");
    const normalized = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    if (times.includes(normalized)) return toast.error("Horário já existe");
    setTimes([...times, normalized].sort());
    setNewTime("09:00");
  };

  const remove = (t: string) => setTimes(times.filter((x) => x !== t));

  const editAt = (idx: number, value: string) => {
    if (!/^\d{1,2}:\d{2}$/.test(value)) return;
    const [h, m] = value.split(":").map(Number);
    const normalized = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    if (times.some((t, i) => i !== idx && t === normalized)) {
      toast.error("Horário já existe");
      return;
    }
    const next = [...times];
    next[idx] = normalized;
    setTimes(next);
  };

  const uniqueCount = new Set(times).size;

  const buildSeqIso = (): string | null => {
    if (!seqDate || !seqTime) return null;
    const [y, mo, d] = seqDate.split("-").map(Number);
    const [h, mi] = seqTime.split(":").map(Number);
    const dt = new Date(y, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0, 0, 0);
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString();
  };

  const save = async () => {
    setSaving(true);
    try {
      const sequence_start_at = buildSeqIso();
      await upsertSchedule({ network, account, times, posts_per_day: uniqueCount, sequence_start_at });
      setSeqStartAt(sequence_start_at);
      await loadNextSlot();
      toast.success(`Configurações salvas: ${label}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const resetSequence = async () => {
    setSaving(true);
    try {
      await upsertSchedule({ network, account, times, posts_per_day: uniqueCount, sequence_start_at: null });
      setSeqDate("");
      setSeqTime("");
      setSeqStartAt(null);
      await loadNextSlot();
      toast.success("Início da sequência removido");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao redefinir");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="rounded-lg border border-border/50 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-gold" />
          <div>
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-muted-foreground">
              Grade padrão sugerida — edite livremente.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[11px]">
            {uniqueCount} posts/dia
          </Badge>
        </div>
      </div>

      <div className="space-y-2">
        {times.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum horário — adicione abaixo.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {times.map((t, i) => (
            <div key={`${t}-${i}`} className="group flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-1.5 py-0.5">
              <Clock size={12} className="ml-1 text-muted-foreground" />
              <TimeInput value={t} onChange={(v) => editAt(i, v)} className="border-0 bg-transparent px-1 py-0" />
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive opacity-60 hover:bg-destructive/10 hover:opacity-100"
                onClick={() => remove(t)}
                aria-label="Remover horário"
              >
                <Trash2 size={12} />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <TimeInput value={newTime || "09:00"} onChange={(v) => setNewTime(v)} />
        <Button size="sm" variant="outline" onClick={add}>
          <Plus size={12} className="mr-1" /> Adicionar horário
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {uniqueCount} horário(s) de publicação
          </Badge>
          <Button size="sm" onClick={save} disabled={saving} className="bg-gold-gradient text-black">
            {saving ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Save size={12} className="mr-1" />}
            Salvar
          </Button>
        </div>
      </div>

      {preview.length > 0 && (
        <div className="rounded-md border border-border/50 bg-background/30 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <CalendarDays size={14} className="text-gold" />
            <p className="text-sm font-medium">Próximas publicações</p>
            <Badge variant="outline" className="text-[10px]">prévia</Badge>
          </div>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {preview.map((d, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1 text-[11px] font-mono tabular-nums">
                <Clock size={11} className="text-muted-foreground" />
                {formatDateTimeBR(d)}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Horários simulados com base na grade, no início da sequência e nos posts já agendados.
          </p>
        </div>
      )}


      <div className="rounded-md border border-border/50 bg-background/30 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-gold" />
          <p className="text-sm font-medium">Data inicial dos agendamentos</p>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Ponto de partida da fila desta rede. Após iniciar, o sistema segue os horários acima
          automaticamente e nunca sugere horários anteriores ao último agendamento.
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Começar em (data)</Label>
            <Input
              type="date"
              value={seqDate}
              onChange={(e) => setSeqDate(e.target.value)}
              className="h-8 w-40"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Horário</Label>
            <Input
              type="time"
              value={seqTime}
              onChange={(e) => setSeqTime(e.target.value)}
              className="h-8 w-28"
            />
          </div>
          {seqStartAt && (
            <Button size="sm" variant="ghost" onClick={resetSequence} disabled={saving} className="h-8">
              <RotateCcw size={12} className="mr-1" /> Redefinir
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-1 rounded-md bg-muted/30 p-2 text-[11px] sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Início configurado: </span>
            <span className="font-medium">
              {seqStartAt ? formatDateTimeBR(new Date(seqStartAt)) : "—"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Próximo slot desta rede: </span>
            <span className="font-medium text-gold">
              {nextSlot ? formatDateTimeBR(nextSlot) : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PublishSchedulesCard() {
  return (
    <Card className="glass border-border/50">
      <CardContent className="space-y-5 p-6">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Horários de publicação</h2>
          <p className="text-xs text-muted-foreground">
            Cada rede tem sua própria data inicial e grade de horários. O próximo slot é
            calculado de forma independente por rede.
          </p>
        </div>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Instagram size={14} className="text-pink-400" />
            <h3 className="text-sm font-semibold">Instagram</h3>
          </div>
          {ACCOUNTS.map((a) => (
            <ScheduleEditor key={`ig-${a.value}`} network="instagram" account={a.value} label={a.label} />
          ))}
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Youtube size={14} className="text-red-400" />
            <h3 className="text-sm font-semibold">YouTube</h3>
          </div>
          <ScheduleEditor
            network="youtube"
            account="default"
            label="Canal principal"
            defaultTimes={["10:00", "15:00", "20:00"]}
            defaultPerDay={3}
          />
        </section>

        <p className="text-[11px] text-muted-foreground">
          Em breve: TikTok, Facebook e LinkedIn — cada um com sua própria grade.
        </p>
      </CardContent>
    </Card>
  );
}
