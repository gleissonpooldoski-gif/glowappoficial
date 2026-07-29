import { createContext, useCallback, useContext, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { renderComposition, type CompositionInput } from "@/lib/exportComposition";

export type RenderJob = {
  id: string; // local job id
  editId: string;
  projectId: string;
  templateId: string | null;
  name: string;
  phase: "queued" | "rendering" | "uploading" | "completed" | "failed";
  progress: number; // 0-100
  error?: string | null;
  startedAt: number;
};

export type EnqueuePayload = {
  editId: string;
  projectId: string;
  templateId: string | null;
  name: string;
  composition: CompositionInput;
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
  enqueue: (payload: EnqueuePayload) => string;
  dismiss: (id: string) => void;
};

const RenderQueueContext = createContext<Ctx | undefined>(undefined);

/** Renderizar tudo ao mesmo tempo trava a CPU e deixa TODOS os vídeos lentos.
 *  Processamos poucos por vez para maximizar a vazão real. */
const MAX_CONCURRENT = Math.max(1, Math.min(2, Math.floor((navigator.hardwareConcurrency || 4) / 4)));

export function RenderQueueProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const jobsRef = useRef<RenderJob[]>([]);
  jobsRef.current = jobs;

  const runningRef = useRef(0);
  const pendingRef = useRef<Array<{ id: string; payload: EnqueuePayload }>>([]);

  const update = useCallback((id: string, patch: Partial<RenderJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);


  const runJob = useCallback(async (jobId: string, payload: EnqueuePayload) => {
    const { editId, projectId, templateId, name, composition, videoMeta, replaceVideoId } = payload;
    try {
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

      update(jobId, { phase: "uploading", progress: 96 });

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

      update(jobId, { phase: "completed", progress: 100 });
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
      update(jobId, { phase: "failed", error: msg });
      toast.error(`Falha ao renderizar "${name}": ${msg}`);
      try {
        await (supabase as any).from("edits").update({ status: "failed" }).eq("id", editId);
      } catch {}
    }
  }, [update]);

  const pump = useCallback(() => {
    while (runningRef.current < MAX_CONCURRENT && pendingRef.current.length > 0) {
      const next = pendingRef.current.shift()!;
      runningRef.current += 1;
      void runJob(next.id, next.payload).finally(() => {
        runningRef.current -= 1;
        pump();
      });
    }
  }, [runJob]);

  const enqueue = useCallback((payload: EnqueuePayload) => {
    const id = `${payload.editId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const job: RenderJob = {
      id,
      editId: payload.editId,
      projectId: payload.projectId,
      templateId: payload.templateId,
      name: payload.name,
      phase: "queued",
      progress: 0,
      startedAt: Date.now(),
    };
    setJobs((prev) => [...prev, job]);
    pendingRef.current.push({ id, payload });
    pump();
    return id;
  }, [pump]);


  const dismiss = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  return (
    <RenderQueueContext.Provider value={{ jobs, enqueue, dismiss }}>
      {children}
    </RenderQueueContext.Provider>
  );
}

export function useRenderQueue() {
  const ctx = useContext(RenderQueueContext);
  if (!ctx) throw new Error("useRenderQueue must be used within RenderQueueProvider");
  return ctx;
}
