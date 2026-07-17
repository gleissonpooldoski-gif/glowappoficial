// Extrai frames representativos de um vídeo (client-side) para envio a modelos de visão.
// Retorna data URLs JPEG (base64) prontos para uso em image_url.

export async function extractVideoFrames(
  videoUrl: string,
  count = 4,
  maxWidth = 640,
  quality = 0.7,
): Promise<string[]> {
  if (!videoUrl) return [];
  return new Promise<string[]>((resolve) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;

    const frames: string[] = [];
    let cancelled = false;

    const cleanup = () => {
      video.removeAttribute("src");
      try { video.load(); } catch {}
    };

    const timeout = window.setTimeout(() => {
      cancelled = true;
      cleanup();
      resolve(frames);
    }, 20000);

    video.addEventListener("error", () => {
      window.clearTimeout(timeout);
      cleanup();
      resolve(frames);
    });

    video.addEventListener("loadedmetadata", async () => {
      try {
        const duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
        if (!duration) { window.clearTimeout(timeout); cleanup(); resolve(frames); return; }
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) { window.clearTimeout(timeout); cleanup(); resolve(frames); return; }
        const scale = Math.min(1, maxWidth / w);
        const cw = Math.round(w * scale);
        const ch = Math.round(h * scale);
        const canvas = document.createElement("canvas");
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext("2d");
        if (!ctx) { window.clearTimeout(timeout); cleanup(); resolve(frames); return; }

        // Timestamps: distribuídos, evitando extremos
        const stamps: number[] = [];
        for (let i = 0; i < count; i++) {
          const t = duration * ((i + 1) / (count + 1));
          stamps.push(Math.max(0.1, Math.min(duration - 0.1, t)));
        }

        for (const t of stamps) {
          if (cancelled) break;
          await new Promise<void>((res) => {
            const onSeek = () => { video.removeEventListener("seeked", onSeek); res(); };
            video.addEventListener("seeked", onSeek);
            try { video.currentTime = t; } catch { res(); }
          });
          try {
            ctx.drawImage(video, 0, 0, cw, ch);
            frames.push(canvas.toDataURL("image/jpeg", quality));
          } catch {
            // taint / canvas error → interrompe
            break;
          }
        }
      } finally {
        window.clearTimeout(timeout);
        cleanup();
        resolve(frames);
      }
    });
  });
}
