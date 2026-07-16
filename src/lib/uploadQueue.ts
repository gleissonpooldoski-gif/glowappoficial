import { supabase } from "@/integrations/supabase/client";

export const BUCKET = "videos";
export const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
export const ACCEPT_MIME = ["video/mp4", "video/quicktime", "video/webm"];
export const ACCEPT_EXT = /\.(mp4|mov|webm)$/i;
export const CONCURRENCY = 3;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export type QueueStatus = "pending" | "hashing" | "uploading" | "completed" | "failed" | "duplicate";

export type QueueItem = {
  id: string;
  file: File;
  status: QueueStatus;
  progress: number;
  error?: string;
  videoId?: string;
  thumbnailUrl?: string;
  durationSeconds?: number | null;
  fileHash?: string;
  xhr?: XMLHttpRequest;
};

export function validateFile(file: File): string | null {
  const okType = ACCEPT_MIME.includes(file.type) || ACCEPT_EXT.test(file.name);
  if (!okType) return "Formato não suportado (use MP4, MOV, WEBM)";
  if (file.size > MAX_BYTES) return "Arquivo maior que 2GB";
  if (file.size === 0) return "Arquivo vazio ou corrompido";
  return null;
}

// Fast content-based hash: SHA-256 of (first 2MB + last 2MB + size + name).
// Good enough to detect true duplicates without reading GB into RAM.
export async function computeFileHash(file: File): Promise<string> {
  const SAMPLE = 2 * 1024 * 1024;
  const head = await file.slice(0, Math.min(SAMPLE, file.size)).arrayBuffer();
  const tail =
    file.size > SAMPLE
      ? await file.slice(Math.max(0, file.size - SAMPLE)).arrayBuffer()
      : new ArrayBuffer(0);
  const meta = new TextEncoder().encode(`${file.size}:${file.name}`);
  const combined = new Uint8Array(head.byteLength + tail.byteLength + meta.byteLength);
  combined.set(new Uint8Array(head), 0);
  combined.set(new Uint8Array(tail), head.byteLength);
  combined.set(meta, head.byteLength + tail.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", combined);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

export class DuplicateVideoError extends Error {
  constructor() {
    super("Este vídeo já foi enviado.");
    this.name = "DuplicateVideoError";
  }
}

export async function processItem(
  item: QueueItem,
  projectId: string | null,
  onProgress: (pct: number) => void,
  registerXhr: (xhr: XMLHttpRequest) => void,
  onHash?: (hash: string) => void
): Promise<{ videoId: string; thumbnailUrl?: string; duration: number | null; fileHash: string }> {
  const fileHash = item.fileHash ?? (await computeFileHash(item.file));
  onHash?.(fileHash);
  // Uploads duplicados são permitidos — cada envio é uma nova utilização.

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
      file_hash: fileHash,
      status: "completed" as any,
      progress: 100,
    } as any)
    .select("id")
    .single();
  if (insertErr) {
    // Cleanup uploaded files if DB insert fails (e.g. race on unique hash)
    const paths = [originalPath, thumbnailPath].filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    if ((insertErr as any).code === "23505") throw new DuplicateVideoError();
    throw insertErr;
  }

  return { videoId: inserted!.id as string, thumbnailUrl, duration, fileHash };
}
