import { supabase } from "@/integrations/supabase/client";

export const BUCKET = "videos";
export const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
export const ACCEPT_MIME = ["video/mp4", "video/quicktime", "video/webm"];
export const ACCEPT_EXT = /\.(mp4|mov|webm)$/i;
export const CONCURRENCY = 3;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export type QueueStatus = "pending" | "uploading" | "completed" | "failed";

export type QueueItem = {
  id: string;
  file: File;
  status: QueueStatus;
  progress: number;
  error?: string;
  videoId?: string;
  thumbnailUrl?: string;
  durationSeconds?: number | null;
  xhr?: XMLHttpRequest;
};

export function validateFile(file: File): string | null {
  const okType = ACCEPT_MIME.includes(file.type) || ACCEPT_EXT.test(file.name);
  if (!okType) return "Formato não suportado (use MP4, MOV, WEBM)";
  if (file.size > MAX_BYTES) return "Arquivo maior que 2GB";
  if (file.size === 0) return "Arquivo vazio ou corrompido";
  return null;
}

export function probeDurationAndThumbnail(
  file: File
): Promise<{ duration: number | null; thumbnail: Blob | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    const cleanup = () => URL.revokeObjectURL(url);

    video.onloadedmetadata = () => {
      const duration = isFinite(video.duration) ? video.duration : null;
      const seek = Math.min(1, (duration ?? 1) * 0.1);
      video.currentTime = seek;
    };
    video.onseeked = () => {
      try {
        const w = video.videoWidth || 360;
        const h = video.videoHeight || 640;
        const scale = Math.min(1, 480 / Math.max(w, h));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          return resolve({ duration: isFinite(video.duration) ? video.duration : null, thumbnail: null });
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            cleanup();
            resolve({
              duration: isFinite(video.duration) ? video.duration : null,
              thumbnail: blob,
            });
          },
          "image/jpeg",
          0.72
        );
      } catch {
        cleanup();
        resolve({ duration: null, thumbnail: null });
      }
    };
    video.onerror = () => {
      cleanup();
      resolve({ duration: null, thumbnail: null });
    };
  });
}

export function uploadWithProgress(
  path: string,
  file: Blob,
  contentType: string,
  onProgress: (pct: number) => void
): { promise: Promise<void>; xhr: XMLHttpRequest } {
  const xhr = new XMLHttpRequest();
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURI(path)}`;
  const promise = new Promise<void>((resolve, reject) => {
    xhr.open("POST", url, true);
    xhr.setRequestHeader("apikey", SUPABASE_KEY);
    xhr.setRequestHeader("Authorization", `Bearer ${SUPABASE_KEY}`);
    xhr.setRequestHeader("Content-Type", contentType || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "3600");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload falhou (${xhr.status}): ${xhr.responseText || xhr.statusText}`));
    };
    xhr.onerror = () => reject(new Error("Falha de conexão"));
    xhr.onabort = () => reject(new Error("Upload interrompido"));
    xhr.send(file);
  });
  return { promise, xhr };
}

export async function processItem(
  item: QueueItem,
  projectId: string | null,
  onProgress: (pct: number) => void,
  registerXhr: (xhr: XMLHttpRequest) => void
): Promise<{ videoId: string; thumbnailUrl?: string; duration: number | null }> {
  const safeName = item.file.name.replace(/[^\w.\-]+/g, "_");
  const key = `${crypto.randomUUID()}-${safeName}`;
  const originalPath = `originals/${key}`;

  const { duration, thumbnail } = await probeDurationAndThumbnail(item.file);

  const { promise, xhr } = uploadWithProgress(
    originalPath,
    item.file,
    item.file.type || "video/mp4",
    onProgress
  );
  registerXhr(xhr);
  await promise;

  let thumbnailPath: string | null = null;
  let thumbnailUrl: string | undefined;
  if (thumbnail) {
    thumbnailPath = `thumbnails/${key}.jpg`;
    try {
      const { promise: tp } = uploadWithProgress(thumbnailPath, thumbnail, "image/jpeg", () => {});
      await tp;
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(thumbnailPath, 60 * 60 * 24 * 7);
      thumbnailUrl = data?.signedUrl;
    } catch {
      thumbnailPath = null;
    }
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("videos")
    .insert({
      project_id: projectId,
      filename: item.file.name,
      original_path: originalPath,
      thumbnail_path: thumbnailPath,
      thumbnail_url: thumbnailUrl,
      duration_seconds: duration ?? undefined,
      size_bytes: item.file.size,
      mime_type: item.file.type,
      status: "completed" as any,
      progress: 100,
    })
    .select("id")
    .single();
  if (insertErr) throw insertErr;

  return { videoId: inserted!.id as string, thumbnailUrl, duration };
}
