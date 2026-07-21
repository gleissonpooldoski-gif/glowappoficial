// Grade de horários de publicação por REDE + conta (e opcionalmente por categoria).
import { supabase } from "@/integrations/supabase/client";
import type { InstagramAccount } from "@/lib/instagram";
import type { NetworkId } from "@/lib/publish-networks";

export type ScheduleNetwork = "instagram" | "youtube" | "tiktok";

export type PublishSchedule = {
  id: string;
  network: ScheduleNetwork;
  account: string;
  category: string | null;
  times: string[];         // ["09:00","12:30", ...] em ordem
  posts_per_day: number;
  timezone: string;
  sequence_start_at: string | null;
  created_at: string;
  updated_at: string;
};

export const DEFAULT_TIMES = ["09:00", "12:30", "15:30", "19:00", "22:00"];

const T = () => supabase.from("publish_schedules" as any);

/** Tabela e coluna de "conta" usada pela grade para cada rede. */
const NETWORK_TABLE: Record<ScheduleNetwork, string> = {
  instagram: "instagram_posts",
  youtube: "youtube_posts",
  tiktok: "tiktok_posts",
};

/** Contas usadas por cada rede (para casar a coluna `account` da tabela de posts). */
export function accountsForNetwork(net: ScheduleNetwork): string[] {
  if (net === "youtube") return ["default"];
  return ["frame", "resenha"];
}

export async function listSchedules(): Promise<PublishSchedule[]> {
  const { data, error } = await T().select("*").order("network", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    network: (r.network ?? "instagram") as ScheduleNetwork,
    times: normalizeTimes(r.times),
  })) as PublishSchedule[];
}

export async function getSchedule(
  network: ScheduleNetwork,
  account: string,
  category: string | null = null,
): Promise<PublishSchedule | null> {
  let q = T().select("*").eq("network", network).eq("account", account).limit(1);
  q = category ? q.eq("category", category) : q.is("category", null);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...(data as any),
    network: ((data as any).network ?? "instagram") as ScheduleNetwork,
    times: normalizeTimes((data as any).times),
  };
}

export async function upsertSchedule(input: {
  network: ScheduleNetwork;
  account: string;
  category?: string | null;
  times: string[];
  posts_per_day: number;
  sequence_start_at?: string | null;
}) {
  const payload: Record<string, unknown> = {
    network: input.network,
    account: input.account,
    category: input.category ?? null,
    times: normalizeTimes(input.times),
    posts_per_day: Math.max(1, Math.min(50, Math.round(input.posts_per_day))),
  };
  if (input.sequence_start_at !== undefined) {
    payload.sequence_start_at = input.sequence_start_at;
  }
  const existing = await getSchedule(input.network, input.account, input.category ?? null);
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
 * Encontra o próximo slot livre para (rede + conta), respeitando:
 * - Grade de horários configurada (times);
 * - Limite de posts por dia (posts_per_day);
 * - Slots já ocupados na tabela de posts da rede.
 */
export async function findNextSlot(
  network: ScheduleNetwork,
  account: string,
  opts: { category?: string | null; horizonDays?: number } = {},
): Promise<Date | null> {
  const slots = await findNextSlots(network, account, 1, opts);
  return slots[0] ?? null;
}

/** Compatibilidade retroativa: chamadas antigas passando apenas o account do IG. */
export async function findNextSlotIG(account: InstagramAccount) {
  return findNextSlot("instagram", account);
}

/**
 * Encontra os próximos N slots livres em sequência para (rede + conta).
 * Considera slots já reservados no banco + os slots que este próprio cálculo
 * está distribuindo (evita colisão dentro do lote).
 */
export async function findNextSlots(
  network: ScheduleNetwork,
  account: string,
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
  const schedule = await getSchedule(network, account, opts.category ?? null)
    ?? (await getSchedule(network, account, null));
  const times = schedule?.times?.length ? schedule.times : DEFAULT_TIMES;
  const perDay = schedule?.posts_per_day ?? times.length;
  if (times.length === 0) return [];

  const horizon = opts.horizonDays ?? 90;
  const fromIso = new Date().toISOString();
  const toIso = new Date(Date.now() + horizon * 86_400_000).toISOString();
  const table = NETWORK_TABLE[network];
  const activeStatuses = network === "instagram"
    ? ["AGENDADO", "PUBLICANDO"]
    : ["AGENDADO", "PUBLICANDO"]; // mesma convenção nas 3 tabelas
  let bookedQ = supabase
    .from(table as any)
    .select("scheduled_at,status,account")
    .in("status", activeStatuses)
    .gte("scheduled_at", fromIso)
    .lte("scheduled_at", toIso);
  // youtube_posts.account é sempre "default" — filtrar mesmo assim é seguro.
  bookedQ = bookedQ.eq("account", account);
  const { data: booked } = await bookedQ;

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

  // MODO AUTOMÁTICO: âncora = MAIOR entre último post agendado e sequence_start_at.
  if (!startBase) {
    const { data: lastRow } = await supabase
      .from(table as any)
      .select("scheduled_at")
      .eq("account", account)
      .in("status", activeStatuses)
      .not("scheduled_at", "is", null)
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastIso = (lastRow as any)?.scheduled_at as string | undefined;
    const lastTs = lastIso ? new Date(lastIso).getTime() : 0;
    const seqStartTs = schedule?.sequence_start_at
      ? new Date(schedule.sequence_start_at).getTime()
      : 0;
    const anchorTs = Math.max(lastTs, seqStartTs);
    if (anchorTs > Date.now()) startBase = new Date(anchorTs);
  }

  let minStart = Date.now() + 60_000;
  if (startBase) minStart = Math.max(minStart, startBase.getTime());

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

/** Resolve a conta usada na grade a partir da rede + conta do IG (frame/resenha). */
export function scheduleAccountFor(net: NetworkId, igAccount: InstagramAccount | null): string | null {
  if (net === "youtube") return "default";
  if (net === "instagram" || net === "tiktok") return igAccount ?? null;
  return null;
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
