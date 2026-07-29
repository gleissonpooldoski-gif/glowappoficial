import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Clock, Plus, Trash2, Save, Loader2, CalendarClock, CalendarDays, Minus, RotateCcw, FolderPlus,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import TimeInput from "@/components/TimeInput";
import { useActiveProject, type ActiveProject } from "@/context/ProjectContext";
import {
  DEFAULT_PROJECT_TIMES,
  ProjectScheduleSettings,
  ensureProjectSchedule,
  findProjectSlots,
  refreshProjectSlotTracking,
  saveProjectSchedule,
} from "@/lib/project-schedules";

function formatDateTimeBR(d: Date) {
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function ProjectScheduleEditor({ project }: { project: ActiveProject }) {
  const [times, setTimes] = useState<string[]>(DEFAULT_PROJECT_TIMES);
  const [perDay, setPerDay] = useState(DEFAULT_PROJECT_TIMES.length);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Date[]>([]);

  const applySettings = (s: ProjectScheduleSettings) => {
    setTimes(s.publication_times);
    setPerDay(Math.min(s.posts_per_day, s.publication_times.length));
    setStartDate(s.start_date ?? "");
    setStartTime((s.start_time ?? "").slice(0, 5));
  };

  const loadPreview = async (settings?: ProjectScheduleSettings) => {
    try {
      setPreview(await findProjectSlots(project.id, 6, { settings: settings ?? null }));
    } catch {
      setPreview([]);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const s = await ensureProjectSchedule(project.id);
        if (cancelled) return;
        applySettings(s);
        await loadPreview(s);
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message ?? "Erro ao carregar configuração");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const suggestNextTime = (): string => {
    if (times.length === 0) return "09:00";
    const [h, m] = times[times.length - 1].split(":").map(Number);
    let total = (h * 60 + m + 90) % 1440;
    let guard = 0;
    let candidate = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    while (times.includes(candidate) && guard < 288) {
      total = (total + 5) % 1440;
      candidate = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
      guard++;
    }
    return candidate;
  };

  const add = () => {
    const candidate = suggestNextTime();
    if (times.includes(candidate)) return toast.error("Horário já existe");
    const next = [...times, candidate].sort();
    setTimes(next);
    setPerDay((p) => Math.min(next.length, p + 1));
  };

  const remove = (t: string) => {
    if (times.length <= 1) return toast.error("Mantenha ao menos um horário");
    const next = times.filter((x) => x !== t);
    setTimes(next);
    setPerDay((p) => Math.min(next.length, p));
  };

  const editAt = (idx: number, value: string) => {
    if (!/^\d{1,2}:\d{2}$/.test(value)) return;
    const [h, m] = value.split(":").map(Number);
    if (h > 23 || m > 59) return toast.error("Horário inválido");
    const normalized = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    if (times.some((t, i) => i !== idx && t === normalized)) return toast.error("Horário já existe");
    const next = [...times];
    next[idx] = normalized;
    setTimes(next.sort());
  };

  const save = async () => {
    setSaving(true);
    try {
      const s = await saveProjectSchedule({
        project_id: project.id,
        posts_per_day: perDay,
        publication_times: times,
        start_date: startDate || null,
        start_time: startTime || null,
      });
      applySettings(s);
      await loadPreview(s);
      void refreshProjectSlotTracking(project.id);
      toast.success(`Configuração salva: ${project.name}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const clearStart = async () => {
    setStartDate("");
    setStartTime("");
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/50 p-4 text-xs text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Carregando {project.name}…
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-border/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-gold" />
          <div>
            <p className="text-sm font-medium">{project.name}</p>
            <p className="text-xs text-muted-foreground">
              Grade própria deste projeto — vale para todas as redes.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-[11px]">{perDay} posts/dia</Badge>
      </div>

      <div className="flex items-center gap-3">
        <Label className="text-xs text-muted-foreground">Posts por dia</Label>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" className="h-7 w-7"
            onClick={() => setPerDay((p) => Math.max(1, p - 1))} aria-label="Diminuir">
            <Minus size={12} />
          </Button>
          <span className="w-8 text-center text-sm font-semibold tabular-nums">{perDay}</span>
          <Button size="icon" variant="outline" className="h-7 w-7"
            onClick={() => setPerDay((p) => Math.min(times.length, p + 1))} aria-label="Aumentar">
            <Plus size={12} />
          </Button>
        </div>
        <span className="text-[11px] text-muted-foreground">
          máximo {times.length} (quantidade de horários)
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {times.map((t, i) => (
          <div key={`${t}-${i}`} className="group flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-1.5 py-0.5">
            <Clock size={12} className="ml-1 text-muted-foreground" />
            <TimeInput value={t} onChange={(v) => editAt(i, v)} className="border-0 bg-transparent px-1 py-0" />
            <Button size="icon" variant="ghost"
              className="h-6 w-6 text-destructive opacity-60 hover:bg-destructive/10 hover:opacity-100"
              onClick={() => remove(t)} aria-label="Remover horário">
              <Trash2 size={12} />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Começar em (data)</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Horário inicial</Label>
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-8 w-28" />
        </div>
        {(startDate || startTime) && (
          <Button size="sm" variant="ghost" className="h-8" onClick={clearStart}>
            <RotateCcw size={12} className="mr-1" /> Limpar
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={add}>
            <Plus size={12} className="mr-1" /> Adicionar horário
          </Button>
          <Button size="sm" onClick={save} disabled={saving} className="bg-gold-gradient text-black">
            {saving ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Save size={12} className="mr-1" />}
            Salvar configuração
          </Button>
        </div>
      </div>

      {preview.length > 0 && (
        <div className="space-y-2 rounded-md border border-border/50 bg-background/30 p-3">
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
            Baseado na configuração salva. Publicações já agendadas não são alteradas.
          </p>
        </div>
      )}
    </div>
  );
}

export default function PublishSchedulesCard() {
  const { projects, loading } = useActiveProject();

  return (
    <Card className="glass border-border/50">
      <CardContent className="space-y-5 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Horários de publicação</h2>
            <p className="text-xs text-muted-foreground">
              Cada projeto tem sua própria grade dinâmica. A última configuração salva vale para
              todos os novos agendamentos (manual, em lote e automático).
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/projects"><FolderPlus size={14} className="mr-1" /> Novo projeto</Link>
          </Button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Carregando projetos…
          </div>
        )}

        {!loading && projects.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhum projeto criado ainda. Crie um projeto para configurar os horários.
          </p>
        )}

        <div className="space-y-3">
          {projects.map((p) => (
            <ProjectScheduleEditor key={p.id} project={p} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
