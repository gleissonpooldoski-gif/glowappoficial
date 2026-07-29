// Configuração DINÂMICA de horários de publicação POR PROJETO.
// A última configuração salva é sempre a fonte de verdade para novos agendamentos.
import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_PROJECT_TIMES = ["09:00", "12:30", "15:30", "19:00", "22:00"];

export type ProjectScheduleSettings = {
  id: string;
  project_id: string;
  platform: string;
  posts_per_day: number;
  publication_times: string[];
  start_date: string | null;
  start_time: string | null;
  last_scheduled_slot: string | null;
  next_available_slot: string | null;
  timezone: string;
  updated_at: string;
};

const T = () => supabase.from("project_schedule_settings" as any);

export function normalizeTimes(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  const clean = arr
    .map((v) => String(v ?? "").trim())
    .filter((v) => /^\d{1,2}:\d{2}$/.test(v))
    .map((v) => {
      const [h, m] = v.split(":").map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return "";
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    })
    .filter(Boolean);
  return Array.from(new Set(clean)).sort();
}

function hydrate(row: any): ProjectScheduleSettings {
  const times = normalizeTimes(row?.publication_times);
  return {
    ...row,
    publication_times: times.length ? times : DEFAULT_PROJECT_TIMES,
    posts_per_day: Math.max(1, Number(row?.posts_per_day) || (times.length || DEFAULT_PROJECT_TIMES.length)),
  } as ProjectScheduleSettings;
}

export async function listProjectSchedules(): Promise<ProjectScheduleSettings[]> {
  const { data, error } = await T().select("*").eq("platform", "all");
  if (error) throw error;
  return ((data ?? []) as any[]).map(hydrate);
}

export async function getProjectSchedule(projectId: string): Promise<ProjectScheduleSettings | null> {
  const { data, error } = await T()
    .select("*")
    .eq("project_id", projectId)
    .eq("platform", "all")
    .maybeSingle();
  if (error) throw error;
  return data ? hydrate(data) : null;
}

/** Garante que o projeto tenha uma configuração (cria a padrão se faltar). */
export async function ensureProjectSchedule(projectId: string): Promise<ProjectScheduleSettings> {
  const existing = await getProjectSchedule(projectId);
  if (existing) return existing;
  const { data, error } = await T()
    .insert({
      project_id: projectId,
      platform: "all",
      posts_per_day: DEFAULT_PROJECT_TIMES.length,
      publication_times: DEFAULT_PROJECT_TIMES,
    })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return hydrate(data);
}

export async function saveProjectSchedule(input: {
  project_id: string;
  posts_per_day: number;
  publication_times: string[];
  start_date?: string | null;
  start_time?: string | null;
}): Promise<ProjectScheduleSettings> {
  const times = normalizeTimes(input.publication_times);
  if (times.length === 0) throw new Error("Adicione ao menos um horário válido");
  if (times.length !== input.publication_times.length) {
    // horários duplicados/inválidos foram descartados
  }
  const payload: Record<string, unknown> = {
    project_id: input.project_id,
    platform: "all",
    publication_times: times,
    posts_per_day: Math.max(1, Math.min(times.length, Math.round(input.posts_per_day))),
  };
  if (input.start_date !== undefined) payload.start_date = input.start_date || null;
  if (input.start_time !== undefined) payload.start_time = input.start_time || null;

  const existing = await getProjectSchedule(input.project_id);
  if (existing) {
    const { data, error } = await T().update(payload).eq("id", existing.id).select("*").maybeSingle();
    if (error) throw error;
    return hydrate(data);
  }
  const { data, error } = await T().insert(payload).select("*").maybeSingle();
  if (error) throw error;
  return hydrate(data);
}

const POST_TABLES = ["instagram_posts", "facebook_posts", "youtube_posts", "tiktok_posts"] as const;
const ACTIVE = ["AGENDADO", "PUBLICANDO"];

async function projectVideoIds(projectId: string): Promise<string[]> {
  const { data } = await supabase.from("videos").select("id").eq("project_id", projectId);
  return ((data ?? []) as any[]).map((r) => r.id as string);
}

/** Todos os slots já ocupados (futuros) do projeto, em qualquer rede. */
export async function fetchBookedSlots(projectId: string): Promise<Date[]> {
  const ids = await projectVideoIds(projectId);
  if (ids.length === 0) return [];
  const fromIso = new Date(Date.now() - 86_400_000).toISOString();
  const results = await Promise.all(
    POST_TABLES.map((t) =>
      supabase
        .from(t as any)
        .select("scheduled_at")
        .in("video_id", ids)
        .in("status", ACTIVE)
        .gte("scheduled_at", fromIso)
        .not("scheduled_at", "is", null),
    ),
  );
  const out: Date[] = [];
  for (const r of results) {
    for (const row of ((r?.data ?? []) as any[])) {
      if (row.scheduled_at) out.push(new Date(row.scheduled_at));
    }
  }
  return out;
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function startAnchor(s: ProjectScheduleSettings): Date | null {
  if (!s.start_date) return null;
  const [y, mo, d] = s.start_date.split("-").map(Number);
  const [h, mi] = (s.start_time ?? "00:00").split(":").map(Number);
  const dt = new Date(y, (mo || 1) - 1, d || 1, h || 0, mi || 0, 0, 0);
  return isNaN(dt.getTime()) ? null : dt;
}

/**
 * Próximos N slots do PROJETO, respeitando SEMPRE a configuração salva:
 * grade de horários, posts/dia, data inicial e slots já ocupados.
 * Nunca altera agendamentos existentes — apenas evita colidir com eles.
 */
export async function findProjectSlots(
  projectId: string,
  count: number,
  opts: { horizonDays?: number; startFrom?: Date | null; settings?: ProjectScheduleSettings | null } = {},
): Promise<Date[]> {
  if (count <= 0) return [];
  const settings = opts.settings ?? (await getProjectSchedule(projectId));
  const saved = normalizeTimes(settings?.publication_times);
  if (!settings || saved.length === 0) {
    console.warn(
      "[agendador] Projeto sem horários salvos — usando grade padrão",
      { projeto: projectId, padrao: DEFAULT_PROJECT_TIMES },
    );
  }
  const times = saved.length ? saved : DEFAULT_PROJECT_TIMES;
  const perDay = Math.max(1, Math.min(settings?.posts_per_day ?? times.length, times.length));
  const horizon = opts.horizonDays ?? 365;

  const booked = await fetchBookedSlots(projectId);
  // Um mesmo vídeo gera um registro por rede no MESMO horário — contar apenas
  // horários distintos, senão o limite de posts/dia estoura e a grade é ignorada.
  const bookedTs = Array.from(new Set(booked.map((d) => d.getTime())));
  const bookedPerDay = new Map<string, number>();
  for (const ts of bookedTs) {
    const key = ymd(new Date(ts));
    bookedPerDay.set(key, (bookedPerDay.get(key) ?? 0) + 1);
  }

  const lastBooked = bookedTs.length ? Math.max(...bookedTs) : 0;
  const anchorDate = opts.startFrom ?? startAnchor(settings as ProjectScheduleSettings);
  const anchorTs = Math.max(anchorDate ? anchorDate.getTime() : 0, lastBooked);
  const minTs = Math.max(Date.now() + 60_000, anchorTs > 0 ? anchorTs + 1 : 0);

  const startDay = new Date(minTs);
  startDay.setHours(0, 0, 0, 0);

  const parsed = times
    .map((t) => t.split(":").map(Number))
    .sort((a, b) => a[0] * 60 + a[1] - (b[0] * 60 + b[1]));
  const allowed = new Set(parsed.map(([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`));

  const out: Date[] = [];
  for (let dayOffset = 0; dayOffset < horizon && out.length < count; dayOffset++) {
    const day = new Date(startDay);
    day.setDate(startDay.getDate() + dayOffset);
    const key = ymd(day);
    let used = bookedPerDay.get(key) ?? 0;
    if (used >= perDay) continue;
    for (const [h, m] of parsed) {
      if (out.length >= count || used >= perDay) break;
      const slot = new Date(day);
      slot.setHours(h, m, 0, 0);
      if (slot.getTime() < minTs) continue;
      if (bookedTs.some((ts) => Math.abs(ts - slot.getTime()) < 5 * 60_000)) continue;
      out.push(slot);
      bookedTs.push(slot.getTime());
      used++;
      bookedPerDay.set(key, used);
    }
  }

  // Log de validação obrigatório
  console.info(
    "[agendador] Projeto:", projectId,
    "| Horários encontrados:", times.join(", "),
    "| Próximo slot calculado:", out[0] ? out[0].toTimeString().slice(0, 5) : "nenhum",
  );
  for (const s of out) {
    if (!allowed.has(s.toTimeString().slice(0, 5))) {
      console.error("Agendamento ignorou configuração personalizada de horário", {
        projeto: projectId,
        configurado: times,
        gerado: s.toISOString(),
      });
    }
  }
  return out;
}

export async function findNextProjectSlot(projectId: string): Promise<Date | null> {
  const [s] = await findProjectSlots(projectId, 1);
  return s ?? null;
}


/** Atualiza os campos de acompanhamento (último/próximo slot) do projeto. */
export async function refreshProjectSlotTracking(projectId: string) {
  try {
    const booked = await fetchBookedSlots(projectId);
    const last = booked.length ? new Date(Math.max(...booked.map((d) => d.getTime()))) : null;
    const next = await findNextProjectSlot(projectId);
    await T()
      .update({
        last_scheduled_slot: last ? last.toISOString() : null,
        next_available_slot: next ? next.toISOString() : null,
      })
      .eq("project_id", projectId)
      .eq("platform", "all");
  } catch { /* não bloqueia */ }
}
