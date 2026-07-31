// Extrai frames representativos de um vídeo (client-side) para envio a modelos de visão.
// Retorna data URLs JPEG (base64) prontos para uso em image_url.

export async function extractVideoFrames(
  videoUrl: string,
  count = 16,
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

        // Amostragem densa + priorização de mudanças bruscas de cena.
        // Extraímos mais candidatos do que o necessário e mantemos os frames
        // visualmente mais distintos (cortes de cena), sempre em ordem cronológica.
        const candidates = Math.min(28, Math.max(count, Math.round(count * 1.6)));
        const stamps: number[] = [];
        for (let i = 0; i < candidates; i++) {
          const t = duration * ((i + 1) / (candidates + 1));
          stamps.push(Math.max(0.1, Math.min(duration - 0.1, t)));
        }

        const shots: Array<{ t: number; data: string; diff: number }> = [];
        let prevHist: Float64Array | null = null;

        const histOf = (img: ImageData) => {
          const h = new Float64Array(48);
          const d = img.data;
          const step = 4 * 8; // amostra 1 a cada 8 px
          let n = 0;
          for (let i = 0; i < d.length; i += step) {
            h[Math.floor(d[i] / 16)] += 1;
            h[16 + Math.floor(d[i + 1] / 16)] += 1;
            h[32 + Math.floor(d[i + 2] / 16)] += 1;
            n += 1;
          }
          if (n) for (let i = 0; i < h.length; i++) h[i] /= n;
          return h;
        };

        for (const t of stamps) {
          if (cancelled) break;
          await new Promise<void>((res) => {
            const onSeek = () => { video.removeEventListener("seeked", onSeek); res(); };
            video.addEventListener("seeked", onSeek);
            try { video.currentTime = t; } catch { res(); }
          });
          try {
            ctx.drawImage(video, 0, 0, cw, ch);
            const data = canvas.toDataURL("image/jpeg", quality);
            let diff = 1;
            try {
              const hist = histOf(ctx.getImageData(0, 0, cw, ch));
              if (prevHist) {
                let d = 0;
                for (let i = 0; i < hist.length; i++) d += Math.abs(hist[i] - prevHist[i]);
                diff = d / 3;
              }
              prevHist = hist;
            } catch { /* sem métrica → mantém diff padrão */ }
            shots.push({ t, data, diff });
          } catch {
            break;
          }
        }

        if (shots.length <= count) {
          for (const s of shots) frames.push(s.data);
        } else {
          // Sempre mantém início/meio/fim + os maiores cortes de cena.
          const keep = new Set<number>([0, Math.floor(shots.length / 2), shots.length - 1]);
          const ranked = shots
            .map((s, i) => ({ i, diff: s.diff }))
            .sort((a, b) => b.diff - a.diff);
          for (const r of ranked) {
            if (keep.size >= count) break;
            keep.add(r.i);
          }
          Array.from(keep).sort((a, b) => a - b).forEach((i) => frames.push(shots[i].data));
        }
      } finally {
        window.clearTimeout(timeout);
        cleanup();
        resolve(frames);
      }
    });
  });
}
