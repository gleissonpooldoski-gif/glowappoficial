import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { renderComposition, type CompositionInput } from "@/lib/exportComposition";

export type RenderPhase =
  | "queued"
  | "preparing"
  | "rendering"
  | "finalizing"
  | "completed"
  | "failed";

export type RenderJob = {
  id: string; // local job id
  editId: string;
  projectId: string;
  templateId: string | null;
  name: string;
  phase: RenderPhase;
  progress: number; // 0-100
  error?: string | null;
  priority: boolean;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  /** Estimativa de conclusão em ms (null enquanto não há amostra). */
  etaMs: number | null;
};

export type EnqueuePayload = {
  editId: string;
  projectId: string;
  templateId: string | null;
  name: string;
  composition: CompositionInput;
  /** Coloca o job no topo da fila (Exportar Agora). */
  priority?: boolean;
  /** When set, updates this existing finished video row instead of inserting a new one. */
  replaceVideoId?: string | null;
  videoMeta?: {
    filename?: string | null;
    duration_seconds?: number | null;
    thumbnail_path?: string | null;
    thumbnail_url?: string | null;
  };
};

type Ctx = {
  jobs: RenderJob[];
  /** Concorrência efetiva calculada para o ambiente atual. */
  concurrency: number;
  /** Jobs renderizando neste momento. */
  activeCount: number;
  /** Jobs aguardando na fila. */
  pendingCount: number;
  /** Posição na fila (1-based) ou null se já iniciou/terminou. */
  queuePosition: (id: string) => number | null;
  enqueue: (payload: EnqueuePayload) => string;
  dismiss: (id: string) => void;
};

const RenderQueueContext = createContext<Ctx | undefined>(undefined);

/**
 * Detecta a capacidade do ambiente (CPU lógica + memória do dispositivo) e
 * define quantas renderizações podem correr em paralelo sem saturar a máquina.
 * Máquina pequena -> 2, média -> 4, robusta -> 6+.
 */
function detectConcurrency(): number {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cpus = Math.max(1, nav.hardwareConcurrency || 4);
  const memGb = nav.deviceMemory ?? 4; // Chrome expõe 0.25..8

  // Cada render usa ~1 thread de encode + decode de vídeo: metade dos núcleos.
  const byCpu = Math.floor(cpus / 2);
  // ~1.5 GB por renderização simultânea, deixando margem para o editor.
  const byMem = Math.floor(memGb / 1.5);

  const capacity = Math.min(byCpu, byMem);
  return Math.max(2, Math.min(8, capacity || 2));
}

export function RenderQueueProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const jobsRef = useRef<RenderJob[]>([]);
  jobsRef.current = jobs;

  const [concurrency] = useState(() => detectConcurrency());
  const concurrencyRef = useRef(concurrency);
  concurrencyRef.current = concurrency;

  const runningRef = useRef(0);
  const pendingRef = useRef<Array<{ id: string; payload: EnqueuePayload }>>([]);
  /** Guarda contra processamento duplicado do mesmo job. */
  const startedRef = useRef<Set<string>>(new Set());
  /** Evita enfileirar a mesma edição duas vezes. */
  const activeEditsRef = useRef<Set<string>>(new Set());
  /** Amostras de duração para estimativa de tempo. */
  const samplesRef = useRef<number[]>([]);

  const update = useCallback((id: string, patch: Partial<RenderJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const avgDuration = useCallback(() => {
    const s = samplesRef.current;
    if (!s.length) return null;
    return s.reduce((a, b) => a + b, 0) / s.length;
  }, []);

  // Atualiza ETA das renderizações ativas periodicamente.
  useEffect(() => {
    const t = setInterval(() => {
      setJobs((prev) => {
        let changed = false;
        const avg = samplesRef.current.length
          ? samplesRef.current.reduce((a, b) => a + b, 0) / samplesRef.current.length
          : null;
        const next = prev.map((j) => {
          if (j.phase === "completed" || j.phase === "failed") return j;
          let eta: number | null = null;
          if (j.startedAt && j.progress > 3) {
            const elapsed = Date.now() - j.startedAt;
            eta = Math.max(0, (elapsed / j.progress) * (100 - j.progress));
          } else if (avg) {
            eta = avg;
          }
          if (eta !== null && Math.abs((j.etaMs ?? -1) - eta) > 1000) {
            changed = true;
            return { ...j, etaMs: eta };
          }
          return j;
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const runJob = useCallback(async (jobId: string, payload: EnqueuePayload) => {
    if (startedRef.current.has(jobId)) return;
    startedRef.current.add(jobId);

    const { editId, projectId, templateId, name, composition, videoMeta, replaceVideoId } = payload;
    const startedAt = Date.now();
    try {
      update(jobId, { phase: "preparing", progress: 1, startedAt });

      // Mark edit as processing right away so it shows up in UI.
      await (supabase as any).from("edits").update({ status: "processing" }).eq("id", editId);

      update(jobId, { phase: "rendering", progress: 2 });

      const result = await renderComposition({
        ...composition,
        onProgress: (pct) => {
          update(jobId, { progress: Math.min(95, Math.round(pct)) });
        },
      });

      if (!result.blob || result.blob.size === 0) throw new Error("Arquivo renderizado ficou vazio.");
      if (result.extension !== "mp4" || !result.mime.startsWith("video/mp4")) {
        throw new Error("Exportação inválida: somente MP4 é permitido.");
      }

      update(jobId, { phase: "finalizing", progress: 96 });

      const stamp = Date.now();
      const base = (name?.trim() || videoMeta?.filename || "video-final")
        .replace(/\.[^.]+$/, "")
        .replace(/[^\w.\-]+/g, "_");
      const finalName = `${base}.${result.extension}`;
      const processedPath = `exports/${editId}/${stamp}-${finalName}`;

      const { error: upErr } = await supabase.storage
        .from("videos-processed")
        .upload(processedPath, result.blob, { contentType: result.mime, upsert: true });
      if (upErr) throw new Error(`Falha ao enviar arquivo final: ${upErr.message}`);

      const { data: signedProbe, error: probeErr } = await supabase.storage
        .from("videos-processed")
        .createSignedUrl(processedPath, 60);
      if (probeErr || !signedProbe?.signedUrl) {
        throw new Error("Arquivo enviado mas não foi possível validar a URL.");
      }

      let finalVideoId: string;

      if (replaceVideoId) {
        // Re-edit flow: update existing video row and remove the old file.
        const { data: prev } = await (supabase as any)
          .from("videos").select("processed_path").eq("id", replaceVideoId).maybeSingle();
        const { error: updErr } = await (supabase as any)
          .from("videos")
          .update({
            filename: finalName,
            mime_type: result.mime,
            status: "completed",
            progress: 100,
            template_id: templateId,
            duration_seconds: result.durationSeconds || videoMeta?.duration_seconds || null,
            size_bytes: result.blob.size,
            processed_path: processedPath,
            updated_at: new Date().toISOString(),
          })
          .eq("id", replaceVideoId);
        if (updErr) throw new Error(`Falha ao atualizar vídeo final: ${updErr.message}`);
        finalVideoId = replaceVideoId;
        if (prev?.processed_path && prev.processed_path !== processedPath) {
          try { await supabase.storage.from("videos-processed").remove([prev.processed_path]); } catch {}
        }
      } else {
        const { data: finishedRow, error: insErr } = await (supabase as any)
          .from("videos")
          .insert({
            filename: finalName,
            mime_type: result.mime,
            status: "completed",
            progress: 100,
            project_id: projectId,
            template_id: templateId,
            duration_seconds: result.durationSeconds || videoMeta?.duration_seconds || null,
            size_bytes: result.blob.size,
            processed_path: processedPath,
            thumbnail_path: videoMeta?.thumbnail_path ?? null,
            thumbnail_url: videoMeta?.thumbnail_url ?? null,
          })
          .select("id")
          .single();
        if (insErr) throw new Error(`Falha ao registrar vídeo final: ${insErr.message}`);
        finalVideoId = finishedRow.id;
      }

      try {
        await (supabase as any).from("render_jobs").insert({
          edit_id: editId,
          project_id: projectId,
          video_id: finalVideoId,
          user_id: null,
          status: "COMPLETED",
          provider: "client-canvas",
          progress: 100,
          output_path: processedPath,
          completed_at: new Date().toISOString(),
        });
      } catch (e) {
        console.warn("[RenderQueue] failed to log render_job", e);
      }

      // Preserve edit for future re-edits; link it to the final video row.
      await (supabase as any).from("edits").update({
        status: "completed",
        output_video_id: finalVideoId,
        updated_at: new Date().toISOString(),
      }).eq("id", editId);

      const elapsed = Date.now() - startedAt;
      samplesRef.current = [...samplesRef.current.slice(-4), elapsed];

      update(jobId, { phase: "completed", progress: 100, finishedAt: Date.now(), etaMs: 0 });
      toast.success(replaceVideoId
        ? `"${name}" atualizado em Vídeos Prontos.`
        : `"${name}" pronto! Enviado para Vídeos Prontos.`);

      // Auto-dismiss completed after a bit.
      setTimeout(() => {
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
      }, 6000);
    } catch (e: any) {
      console.error("[RenderQueue] job failed", e);
      const msg = e?.message ?? "Falha ao renderizar";
      update(jobId, { phase: "failed", error: msg, finishedAt: Date.now(), etaMs: null });
      toast.error(`Falha ao renderizar "${name}": ${msg}`);
      try {
        await (supabase as any).from("edits").update({ status: "failed" }).eq("id", editId);
      } catch {}
    } finally {
      activeEditsRef.current.delete(editId);
    }
  }, [update]);

  /** Worker desacoplado: assim que um job termina, o próximo entra imediatamente. */
  const pump = useCallback(() => {
    while (runningRef.current < concurrencyRef.current && pendingRef.current.length > 0) {
      const next = pendingRef.current.shift()!;
      runningRef.current += 1;
      void runJob(next.id, next.payload).finally(() => {
        runningRef.current -= 1;
        // libera a próxima vaga no próximo tick para não bloquear a UI
        setTimeout(pump, 0);
      });
    }
  }, [runJob]);

  const enqueue = useCallback((payload: EnqueuePayload) => {
    // Guarda contra processamento duplicado da mesma edição.
    if (activeEditsRef.current.has(payload.editId)) {
      const existing = jobsRef.current.find(
        (j) => j.editId === payload.editId && j.phase !== "completed" && j.phase !== "failed",
      );
      if (existing) {
        toast.info(`"${payload.name}" já está na fila de renderização.`);
        return existing.id;
      }
    }
    activeEditsRef.current.add(payload.editId);

    const id = `${payload.editId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const job: RenderJob = {
      id,
      editId: payload.editId,
      projectId: payload.projectId,
      templateId: payload.templateId,
      name: payload.name,
      phase: "queued",
      progress: 0,
      priority: !!payload.priority,
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      etaMs: avgDuration(),
    };
    setJobs((prev) => [...prev, job]);

    if (payload.priority) {
      // Exportar Agora: vai para o topo, à frente dos jobs não prioritários.
      const lastPriorityIdx = pendingRef.current.reduce(
        (acc, p, i) => (p.payload.priority ? i : acc),
        -1,
      );
      pendingRef.current.splice(lastPriorityIdx + 1, 0, { id, payload });
    } else {
      pendingRef.current.push({ id, payload });
    }

    pump();
    return id;
  }, [avgDuration, pump]);

  const dismiss = useCallback((id: string) => {
    const removed = pendingRef.current.find((p) => p.id === id);
    if (removed) activeEditsRef.current.delete(removed.payload.editId);
    pendingRef.current = pendingRef.current.filter((p) => p.id !== id);
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const queuePosition = useCallback((id: string) => {
    const idx = pendingRef.current.findIndex((p) => p.id === id);
    return idx === -1 ? null : idx + 1;
  }, []);

  const activeCount = useMemo(
    () => jobs.filter((j) => j.phase === "preparing" || j.phase === "rendering" || j.phase === "finalizing").length,
    [jobs],
  );
  const pendingCount = useMemo(() => jobs.filter((j) => j.phase === "queued").length, [jobs]);

  return (
    <RenderQueueContext.Provider
      value={{ jobs, concurrency, activeCount, pendingCount, queuePosition, enqueue, dismiss }}
    >
      {children}
    </RenderQueueContext.Provider>
  );
}

export function useRenderQueue() {
  const ctx = useContext(RenderQueueContext);
  if (!ctx) throw new Error("useRenderQueue must be used within RenderQueueProvider");
  return ctx;
}
