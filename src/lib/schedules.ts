// Grade de horários de publicação por conta (e opcionalmente por categoria).
import { supabase } from "@/integrations/supabase/client";
import type { InstagramAccount } from "@/lib/instagram";

export type PublishSchedule = {
  id: string;
  account: InstagramAccount;
  category: string | null;
  times: string[];         // ["09:00","12:30", ...] em ordem
  posts_per_day: number;
  timezone: string;
  created_at: string;
  updated_at: string;
};

export const DEFAULT_TIMES = ["09:00", "12:30", "15:30", "19:00", "22:00"];

const T = () => supabase.from("publish_schedules" as any);

export async function listSchedules(): Promise<PublishSchedule[]> {
  const { data, error } = await T().select("*").order("account", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    times: normalizeTimes(r.times),
  })) as PublishSchedule[];
}

export async function getSchedule(
  account: InstagramAccount,
  category: string | null = null,
): Promise<PublishSchedule | null> {
  let q = T().select("*").eq("account", account).limit(1);
  q = category ? q.eq("category", category) : q.is("category", null);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...(data as any), times: normalizeTimes((data as any).times) };
}

export async function upsertSchedule(input: {
  account: InstagramAccount;
  category?: string | null;
  times: string[];
  posts_per_day: number;
}) {
  const payload = {
    account: input.account,
    category: input.category ?? null,
    times: normalizeTimes(input.times),
    posts_per_day: Math.max(1, Math.min(50, Math.round(input.posts_per_day))),
  };
  const existing = await getSchedule(input.account, input.category ?? null);
  if (existing) {
    const { error } = await T().update(payload).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await T().insert(payload);
    if (error) throw error;
  }
}

export async function deleteSchedule(id: string) {
  const { error } = await T().delete().eq("id", id);
  if (error) throw error;
}

function normalizeTimes(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  const clean = arr
    .map((v) => String(v ?? "").trim())
    .filter((v) => /^\d{1,2}:\d{2}$/.test(v))
    .map((v) => {
      const [h, m] = v.split(":");
      return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
    });
  return Array.from(new Set(clean)).sort();
}

/**
 * Encontra o próximo slot livre para uma conta, respeitando:
 * - Grade de horários configurada (times);
 * - Limite de posts por dia (posts_per_day);
 * - Slots já ocupados por instagram_posts com scheduled_at (AGENDADO/PUBLICANDO).
 *
 * Retorna um `Date` local do próximo horário disponível, ou null se a grade estiver vazia.
 */
export async function findNextSlot(
  account: InstagramAccount,
  opts: { category?: string | null; horizonDays?: number } = {},
): Promise<Date | null> {
  const schedule = await getSchedule(account, opts.category ?? null)
    ?? (await getSchedule(account, null));
  const times = schedule?.times?.length ? schedule.times : DEFAULT_TIMES;
  const perDay = schedule?.posts_per_day ?? times.length;
  if (times.length === 0) return null;

  // Puxa slots já reservados no horizonte.
  const horizon = opts.horizonDays ?? 30;
  const fromIso = new Date().toISOString();
  const toIso = new Date(Date.now() + horizon * 86_400_000).toISOString();
  const { data: booked } = await supabase
    .from("instagram_posts" as any)
    .select("scheduled_at,status,account")
    .eq("account", account)
    .in("status", ["AGENDADO", "PUBLICANDO"])
    .gte("scheduled_at", fromIso)
    .lte("scheduled_at", toIso);
  const bookedTimes = new Set<number>();
  const bookedPerDay = new Map<string, number>();
  for (const row of (booked ?? []) as any[]) {
    if (!row.scheduled_at) continue;
    const d = new Date(row.scheduled_at);
    bookedTimes.add(d.getTime());
    const key = ymd(d);
    bookedPerDay.set(key, (bookedPerDay.get(key) ?? 0) + 1);
  }

  // Âncora automática: continua a partir do ÚLTIMO agendado da conta.
  let anchor = Date.now() + 60_000;
  const { data: lastRow } = await supabase
    .from("instagram_posts" as any)
    .select("scheduled_at")
    .eq("account", account)
    .in("status", ["AGENDADO", "PUBLICANDO"])
    .not("scheduled_at", "is", null)
    .order("scheduled_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastIso = (lastRow as any)?.scheduled_at as string | undefined;
  const hasAnchor = !!(lastIso && new Date(lastIso).getTime() > Date.now());
  if (hasAnchor) anchor = Math.max(anchor, new Date(lastIso!).getTime());

  const startDay = new Date(hasAnchor ? new Date(lastIso!) : new Date());
  startDay.setHours(0, 0, 0, 0);

  for (let dayOffset = 0; dayOffset < horizon; dayOffset++) {
    const day = new Date(startDay);
    day.setDate(day.getDate() + dayOffset);
    const key = ymd(day);
    // Com âncora, ignoramos o cap de posts_per_day.
    if (!hasAnchor && (bookedPerDay.get(key) ?? 0) >= perDay) continue;


    for (const t of times) {
      const [h, m] = t.split(":").map(Number);
      const slot = new Date(day);
      slot.setHours(h, m, 0, 0);
      if (slot.getTime() < minStart) continue;
      // Considera ocupado se houver algo em janela de ±5min.
      const occupied = Array.from(bookedTimes).some(
        (ts) => Math.abs(ts - slot.getTime()) < 5 * 60_000,
      );
      if (occupied) continue;
      return slot;
    }
  }
  return null;
}

/**
 * Encontra os próximos N slots livres em sequência para uma conta.
 * Considera slots já reservados no banco + os slots que este próprio cálculo
 * está distribuindo (evita colisão dentro do lote).
 */
export async function findNextSlots(
  account: InstagramAccount,
  count: number,
  opts: {
    category?: string | null;
    horizonDays?: number;
    /** Se informado, o primeiro slot será exatamente este horário (se livre) e os
     *  demais seguirão a grade a partir dele. */
    startFrom?: Date | null;
  } = {},
): Promise<Date[]> {
  if (count <= 0) return [];
  const schedule = await getSchedule(account, opts.category ?? null)
    ?? (await getSchedule(account, null));
  const times = schedule?.times?.length ? schedule.times : DEFAULT_TIMES;
  const perDay = schedule?.posts_per_day ?? times.length;
  if (times.length === 0) return [];

  const horizon = opts.horizonDays ?? 90;
  const fromIso = new Date().toISOString();
  const toIso = new Date(Date.now() + horizon * 86_400_000).toISOString();
  const { data: booked } = await supabase
    .from("instagram_posts" as any)
    .select("scheduled_at,status,account")
    .eq("account", account)
    .in("status", ["AGENDADO", "PUBLICANDO"])
    .gte("scheduled_at", fromIso)
    .lte("scheduled_at", toIso);

  const bookedTimes: number[] = [];
  const bookedPerDay = new Map<string, number>();
  for (const row of (booked ?? []) as any[]) {
    if (!row.scheduled_at) continue;
    const d = new Date(row.scheduled_at);
    bookedTimes.push(d.getTime());
    const key = ymd(d);
    bookedPerDay.set(key, (bookedPerDay.get(key) ?? 0) + 1);
  }

  const results: Date[] = [];
  let startBase = opts.startFrom ?? null;

  // MODO AUTOMÁTICO: se não veio startFrom, usa como âncora o ÚLTIMO post já
  // agendado/publicando da conta. Assim o próximo vídeo cai no slot da grade
  // logo depois do último agendamento, respeitando a sequência que o usuário
  // já definiu — mesmo que existam "buracos" livres no meio.
  if (!startBase) {
    const { data: lastRow } = await supabase
      .from("instagram_posts" as any)
      .select("scheduled_at")
      .eq("account", account)
      .in("status", ["AGENDADO", "PUBLICANDO"])
      .not("scheduled_at", "is", null)
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastIso = (lastRow as any)?.scheduled_at as string | undefined;
    if (lastIso) {
      const lastDate = new Date(lastIso);
      if (lastDate.getTime() > Date.now()) startBase = lastDate;
    }
  }

  // Mínimo é 1min à frente. Se há uma âncora (manual ou último agendado),
  // nenhum slot pode ser anterior/igual a ela.
  let minStart = Date.now() + 60_000;
  if (startBase) minStart = Math.max(minStart, startBase.getTime());

  // Se veio startFrom EXPLÍCITO (modo manual), o primeiro slot é exatamente
  // esse horário. No modo automático (âncora derivada do último post), a
  // âncora NÃO ocupa um slot — apenas define de onde continuar.
  if (opts.startFrom) {
    const occupied = bookedTimes.some(
      (ts) => Math.abs(ts - opts.startFrom!.getTime()) < 5 * 60_000,
    );
    if (!occupied) {
      results.push(new Date(opts.startFrom));
      bookedTimes.push(opts.startFrom.getTime());
      const key = ymd(opts.startFrom);
      bookedPerDay.set(key, (bookedPerDay.get(key) ?? 0) + 1);
    }
  }

  const startDay = new Date(startBase ?? new Date());
  startDay.setHours(0, 0, 0, 0);

  // Quando há âncora, preenchemos a grade ignorando o cap de posts_per_day
  // — o que importa são os slots realmente ocupados.
  const ignorePerDayCap = !!startBase;

  for (let dayOffset = 0; dayOffset < horizon && results.length < count; dayOffset++) {
    const day = new Date(startDay);
    day.setDate(day.getDate() + dayOffset);
    const key = ymd(day);
    let used = bookedPerDay.get(key) ?? 0;
    if (!ignorePerDayCap && used >= perDay) continue;

    for (const t of times) {
      if (results.length >= count) break;
      if (!ignorePerDayCap && used >= perDay) break;
      const [h, m] = t.split(":").map(Number);
      const slot = new Date(day);
      slot.setHours(h, m, 0, 0);
      // Com startFrom, os slots subsequentes devem vir ESTRITAMENTE depois dele.
      if (startBase && slot.getTime() <= startBase.getTime()) continue;
      if (slot.getTime() < minStart) continue;
      const occupied = bookedTimes.some(
        (ts) => Math.abs(ts - slot.getTime()) < 5 * 60_000,
      );
      if (occupied) continue;
      results.push(slot);
      bookedTimes.push(slot.getTime());
      used++;
      bookedPerDay.set(key, used);
    }
  }
  return results;
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
