import { useEffect, useState } from "react";
import { Clock, Plus, Trash2, Save, Loader2, CalendarClock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ACCOUNTS, InstagramAccount } from "@/lib/instagram";
import { DEFAULT_TIMES, PublishSchedule, getSchedule, upsertSchedule } from "@/lib/schedules";

function AccountScheduleEditor({ account, label }: { account: InstagramAccount; label: string }) {
  const [times, setTimes] = useState<string[]>(DEFAULT_TIMES);
  const [perDay, setPerDay] = useState<number>(5);
  const [newTime, setNewTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const sched: PublishSchedule | null = await getSchedule(account, null);
        if (sched) {
          setTimes(sched.times.length ? sched.times : DEFAULT_TIMES);
          setPerDay(sched.posts_per_day || 5);
        }
      } catch (e: any) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [account]);

  const add = () => {
    if (!/^\d{1,2}:\d{2}$/.test(newTime)) return toast.error("Formato HH:MM");
    const [h, m] = newTime.split(":").map(Number);
    if (h < 0 || h > 23 || m < 0 || m > 59) return toast.error("Horário inválido");
    const normalized = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    if (times.includes(normalized)) return toast.error("Horário já existe");
    setTimes([...times, normalized].sort());
    setNewTime("");
  };

  const remove = (t: string) => setTimes(times.filter((x) => x !== t));

  const editAt = (idx: number, value: string) => {
    if (!/^\d{1,2}:\d{2}$/.test(value)) return;
    const next = [...times];
    next[idx] = value;
    setTimes(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await upsertSchedule({ account, times, posts_per_day: perDay });
      toast.success(`Horários salvos: ${label}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
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
          <Label className="text-xs text-muted-foreground">Posts/dia</Label>
          <Input
            type="number"
            min={1}
            max={50}
            value={perDay}
            onChange={(e) => setPerDay(Number(e.target.value))}
            className="h-8 w-20"
          />
        </div>
      </div>

      <div className="space-y-2">
        {times.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum horário — adicione abaixo.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {times.map((t, i) => (
            <div key={`${t}-${i}`} className="flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2 py-1">
              <Clock size={12} className="text-muted-foreground" />
              <Input
                type="time"
                value={t}
                onChange={(e) => editAt(i, e.target.value)}
                className="h-7 w-24 border-0 bg-transparent p-0 text-xs focus-visible:ring-0"
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive hover:bg-destructive/10"
                onClick={() => remove(t)}
              >
                <Trash2 size={12} />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input
          type="time"
          value={newTime}
          onChange={(e) => setNewTime(e.target.value)}
          className="h-8 w-32"
        />
        <Button size="sm" variant="outline" onClick={add}>
          <Plus size={12} className="mr-1" /> Adicionar
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {times.length} horário(s)
          </Badge>
          <Button size="sm" onClick={save} disabled={saving} className="bg-gold-gradient text-black">
            {saving ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Save size={12} className="mr-1" />}
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function PublishSchedulesCard() {
  return (
    <Card className="glass border-border/50">
      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Horários de publicação</h2>
          <p className="text-xs text-muted-foreground">
            Configure a grade de horários por conta. Ao agendar em modo automático, o sistema
            escolhe o próximo espaço livre desta grade.
          </p>
        </div>
        <div className="space-y-3">
          {ACCOUNTS.map((a) => (
            <AccountScheduleEditor key={a.value} account={a.value} label={a.label} />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Em breve: horários diferentes por categoria de conteúdo (memes, educativo, vendas, entretenimento).
        </p>
      </CardContent>
    </Card>
  );
}
