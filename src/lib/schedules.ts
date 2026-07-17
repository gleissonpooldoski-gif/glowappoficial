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

  const minStart = Date.now() + 60_000; // pelo menos 1 min no futuro
  for (let dayOffset = 0; dayOffset < horizon; dayOffset++) {
    const day = new Date();
    day.setDate(day.getDate() + dayOffset);
    day.setHours(0, 0, 0, 0);
    const key = ymd(day);
    if ((bookedPerDay.get(key) ?? 0) >= perDay) continue;

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
function ymd(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
