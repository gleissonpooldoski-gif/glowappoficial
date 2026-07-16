// Client-side video composition renderer.
// Renders: original video + template overlay + text layers into a single MP4/WebM
// using an offscreen canvas + MediaRecorder. Runs entirely in the browser — no
// FFmpeg / subprocess on the backend.

export type BlendMode =
  | "normal" | "multiply" | "screen" | "overlay"
  | "lighten" | "darken" | "soft-light" | "hard-light";

export type TextAlign = "left" | "center" | "right";
export type TextTransform = "none" | "uppercase" | "lowercase" | "capitalize";

export type CompText = {
  id: string;
  text: string;
  x: number; // %
  y: number; // %
  size: number; // px in a stage of the same aspect (we scale to output)
  color: string;
  font: string;
  weight: number;
  transform?: TextTransform;
  letterSpacing?: number;
  lineHeight?: number;
  align?: TextAlign;
  shadow?: boolean;
  strokeWidth?: number;
  strokeColor?: string;
  bgColor?: string | null;
};

export type CompositionInput = {
  videoUrl: string;
  templateUrl?: string | null;
  templateKind?: "image" | "video" | null;
  ratio: { width: number; height: number };
  videoTransform?: { zoom: number; x: number; y: number };
  templateOpts?: { opacity: number; blend: BlendMode; fit: "contain" | "cover" };
  texts: CompText[];
  onProgress?: (pct: number, phase: string) => void;
};

export type CompositionResult = {
  blob: Blob;
  mime: string;
  extension: "mp4" | "webm";
  durationSeconds: number;
};

const pickRecorderMime = (): { mime: string; ext: "mp4" | "webm" } => {
  const candidates: { mime: string; ext: "mp4" | "webm" }[] = [
    { mime: "video/mp4;codecs=h264,aac", ext: "mp4" },
    { mime: "video/mp4;codecs=avc1,mp4a", ext: "mp4" },
    { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
    { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mime)) {
      return c;
    }
  }
  return { mime: "video/webm", ext: "webm" };
};

const loadHiddenVideo = (url: string, muted: boolean): Promise<HTMLVideoElement> =>
  new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.src = url;
    v.muted = muted;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error("Falha ao carregar mídia para renderização."));
  });

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar imagem do template."));
    img.src = url;
  });

const drawContainCover = (
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  fit: "contain" | "cover",
) => {
  const sr = sw / sh;
  const dr = dw / dh;
  let w = dw;
  let h = dh;
  if (fit === "contain" ? sr > dr : sr < dr) {
    h = dw / sr;
  } else {
    w = dh * sr;
  }
  const x = (dw - w) / 2;
  const y = (dh - h) / 2;
  ctx.drawImage(src, x, y, w, h);
};

const applyTransformText = (t: string, mode?: TextTransform) => {
  if (!mode || mode === "none") return t;
  if (mode === "uppercase") return t.toUpperCase();
  if (mode === "lowercase") return t.toLowerCase();
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
};

const drawText = (
  ctx: CanvasRenderingContext2D,
  t: CompText,
  W: number,
  H: number,
  scale: number,
) => {
  const text = applyTransformText(t.text || "", t.transform);
  const size = Math.max(8, t.size * scale);
  const weight = t.weight || 700;
  ctx.font = `${weight} ${size}px "${t.font}", sans-serif`;
  ctx.textBaseline = "middle";
  const align = t.align ?? "center";
  ctx.textAlign = align;
  const lineHeight = (t.lineHeight ?? 1.2) * size;
  const letterSpacing = (t.letterSpacing ?? 0) * scale;
  const lines = text.split("\n");
  const cx = (t.x / 100) * W;
  const cy = (t.y / 100) * H;
  const totalHeight = lineHeight * lines.length;

  // measure widths (with letter spacing)
  const measureLine = (line: string) => {
    if (!letterSpacing) return ctx.measureText(line).width;
    let w = 0;
    for (const ch of line) w += ctx.measureText(ch).width + letterSpacing;
    return Math.max(0, w - letterSpacing);
  };

  // background chip
  if (t.bgColor) {
    const pad = 12 * scale;
    const maxW = Math.max(...lines.map(measureLine));
    let bx = cx;
    if (align === "center") bx = cx - maxW / 2;
    else if (align === "right") bx = cx - maxW;
    const by = cy - totalHeight / 2;
    ctx.fillStyle = t.bgColor;
    const r = 8 * scale;
    const rw = maxW + pad * 2;
    const rh = totalHeight + pad;
    ctx.beginPath();
    ctx.moveTo(bx - pad + r, by - pad / 2);
    ctx.arcTo(bx - pad + rw, by - pad / 2, bx - pad + rw, by - pad / 2 + rh, r);
    ctx.arcTo(bx - pad + rw, by - pad / 2 + rh, bx - pad, by - pad / 2 + rh, r);
    ctx.arcTo(bx - pad, by - pad / 2 + rh, bx - pad, by - pad / 2, r);
    ctx.arcTo(bx - pad, by - pad / 2, bx - pad + rw, by - pad / 2, r);
    ctx.closePath();
    ctx.fill();
  }

  const drawLineWithSpacing = (line: string, x: number, y: number, stroke: boolean) => {
    if (!letterSpacing) {
      if (stroke) ctx.strokeText(line, x, y);
      else ctx.fillText(line, x, y);
      return;
    }
    // manual char advance
    let cursor = x;
    if (align === "center") cursor = x - measureLine(line) / 2;
    else if (align === "right") cursor = x - measureLine(line);
    const prevAlign = ctx.textAlign;
    ctx.textAlign = "left";
    for (const ch of line) {
      if (stroke) ctx.strokeText(ch, cursor, y);
      else ctx.fillText(ch, cursor, y);
      cursor += ctx.measureText(ch).width + letterSpacing;
    }
    ctx.textAlign = prevAlign;
  };

  // shadow
  if (t.shadow !== false) {
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 8 * scale;
    ctx.shadowOffsetY = 2 * scale;
  } else {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
  }

  // stroke
  if (t.strokeWidth && t.strokeWidth > 0) {
    ctx.strokeStyle = t.strokeColor ?? "#000";
    ctx.lineWidth = t.strokeWidth * scale * 2;
    ctx.lineJoin = "round";
    lines.forEach((line, i) => {
      const y = cy - totalHeight / 2 + lineHeight * (i + 0.5);
      drawLineWithSpacing(line, cx, y, true);
    });
  }

  // fill
  ctx.fillStyle = t.color || "#fff";
  lines.forEach((line, i) => {
    const y = cy - totalHeight / 2 + lineHeight * (i + 0.5);
    drawLineWithSpacing(line, cx, y, false);
  });

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
};

export async function renderComposition(input: CompositionInput): Promise<CompositionResult> {
  const { videoUrl, templateUrl, templateKind, ratio, texts, onProgress } = input;
  const videoTransform = input.videoTransform ?? { zoom: 1, x: 0, y: 0 };
  const templateOpts = input.templateOpts ?? { opacity: 1, blend: "normal" as BlendMode, fit: "contain" as const };

  onProgress?.(2, "Preparando vídeo");

  const video = await loadHiddenVideo(videoUrl, false);
  video.currentTime = 0;

  let tplImage: HTMLImageElement | null = null;
  let tplVideo: HTMLVideoElement | null = null;
  if (templateUrl) {
    onProgress?.(8, "Carregando template");
    if (templateKind === "video") {
      tplVideo = await loadHiddenVideo(templateUrl, true);
      tplVideo.loop = true;
    } else {
      try {
        tplImage = await loadImage(templateUrl);
      } catch (e) {
        console.warn("[export] template image failed", e);
      }
    }
  }

  // Preload fonts used by texts
  onProgress?.(12, "Carregando fontes");
  const uniqueFonts = Array.from(new Set(texts.map((t) => `${t.weight || 700} ${Math.round(t.size)}px "${t.font}"`)));
  try {
    await Promise.all(uniqueFonts.map((spec) => (document as any).fonts?.load(spec, "Aa")));
    await (document as any).fonts?.ready;
  } catch { /* ignore font load errors */ }

  const W = ratio.width;
  const H = ratio.height;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D não disponível.");

  // scale factor used for text sizes (editor stage renders in CSS px, our
  // output is at ratio.width — assume editor stage ≈ 1080 wide for portrait
  // or the ratio height for landscape). Match by shortest edge to 1080.
  const referenceEdge = Math.min(W, H);
  const scale = referenceEdge / 1080;

  // Detect the source video's real frame rate BEFORE recording, so the output
  // track uses the same CFR and the exported file plays back at 1x. Using a
  // fixed captureStream(fps) with browser auto-sampling avoids the slow-motion
  // artefacts that variable-rate manual `requestFrame()` produces in some
  // muxers.
  const detectSourceFps = async (): Promise<number> => {
    const anyV = video as any;
    if (typeof anyV.requestVideoFrameCallback !== "function") return 30;
    return await new Promise<number>((resolve) => {
      const samples: number[] = [];
      let last = 0;
      let done = false;
      const finish = (fps: number) => { if (!done) { done = true; resolve(fps); } };
      const cb = (_now: number, meta: any) => {
        const t = typeof meta?.mediaTime === "number" ? meta.mediaTime : 0;
        if (last > 0) {
          const dt = t - last;
          if (dt > 0.001 && dt < 0.5) samples.push(dt);
        }
        last = t;
        if (samples.length >= 6) {
          const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
          const fps = Math.round(1 / avg);
          finish(fps >= 15 && fps <= 120 ? fps : 30);
          return;
        }
        anyV.requestVideoFrameCallback(cb);
      };
      anyV.requestVideoFrameCallback(cb);
      // Fallback if the video never produces enough frames quickly
      setTimeout(() => finish(30), 1500);
    });
  };

  // Warm up decoder to measure fps
  video.muted = true;
  try { await video.play(); } catch { /* noop */ }
  const sourceFps = await detectSourceFps();
  try { video.pause(); } catch { /* noop */ }
  video.currentTime = 0;
  await new Promise<void>((r) => {
    const done = () => { video.removeEventListener("seeked", done); r(); };
    video.addEventListener("seeked", done);
    setTimeout(done, 500);
  });
  console.log("[export] source fps ->", sourceFps);

  // captureStream(fps) with a fixed positive fps => browser auto-samples the
  // canvas at CFR. This produces a proper H.264/VP9 CFR track that plays back
  // at real-time speed.
  const stream: MediaStream = (canvas as any).captureStream(sourceFps);

  const anyVideo = video as any;
  try {
    const vStream: MediaStream | undefined = anyVideo.captureStream?.() ?? anyVideo.mozCaptureStream?.();
    vStream?.getAudioTracks().forEach((t) => stream.addTrack(t));
  } catch (e) {
    console.warn("[export] audio capture failed", e);
  }

  const { mime, ext } = pickRecorderMime();
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

  const drawFrame = () => {
    ctx.save();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw && vh) {
      const zoom = videoTransform.zoom || 1;
      const tx = (videoTransform.x / 100) * W;
      const ty = (videoTransform.y / 100) * H;
      ctx.save();
      ctx.translate(W / 2 + tx, H / 2 + ty);
      ctx.scale(zoom, zoom);
      ctx.translate(-W / 2, -H / 2);
      drawContainCover(ctx, video, vw, vh, W, H, "cover");
      ctx.restore();
    }

    if (tplImage || tplVideo) {
      ctx.save();
      ctx.globalAlpha = templateOpts.opacity;
      ctx.globalCompositeOperation = (templateOpts.blend === "normal" ? "source-over" : templateOpts.blend) as GlobalCompositeOperation;
      if (tplImage) {
        drawContainCover(ctx, tplImage, tplImage.naturalWidth, tplImage.naturalHeight, W, H, templateOpts.fit);
      } else if (tplVideo && tplVideo.videoWidth) {
        drawContainCover(ctx, tplVideo, tplVideo.videoWidth, tplVideo.videoHeight, W, H, templateOpts.fit);
      }
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    for (const t of texts) drawText(ctx, t, W, H, scale);
    ctx.restore();

    ctx.restore();
  };

  onProgress?.(18, "Renderizando");

  const duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  let stopReq = false;
  let rafId = 0;

  const hasRVFC = typeof (video as any).requestVideoFrameCallback === "function";

  // Draw whenever a new source frame is decoded (keeps canvas current) AND on
  // every rAF (keeps overlay animation smooth). The auto-sampler on the
  // captureStream picks up the latest canvas state at the fixed fps.
  const onVideoFrame = (_now: number, meta: any) => {
    if (stopReq) return;
    drawFrame();
    if (duration > 0) {
      const t = typeof meta?.mediaTime === "number" ? meta.mediaTime : video.currentTime;
      const p = Math.min(95, 18 + (t / duration) * 77);
      onProgress?.(p, "Renderizando");
    }
    (video as any).requestVideoFrameCallback(onVideoFrame);
  };

  const rafLoop = () => {
    if (stopReq) return;
    drawFrame();
    if (duration > 0) {
      const p = Math.min(95, 18 + (video.currentTime / duration) * 77);
      onProgress?.(p, "Renderizando");
    }
    rafId = requestAnimationFrame(rafLoop);
  };

  // Start recorder BEFORE playback so the very first frame is captured and
  // A/V start together.
  video.muted = false;
  video.volume = 1;
  video.playbackRate = 1;
  if (tplVideo) { tplVideo.playbackRate = 1; await tplVideo.play().catch(() => {}); }
  recorder.start(500);
  const wallStart = performance.now();
  await video.play();

  if (hasRVFC) (video as any).requestVideoFrameCallback(onVideoFrame);
  rafLoop();

  await new Promise<void>((resolve) => {
    const onEnd = () => { video.removeEventListener("ended", onEnd); resolve(); };
    video.addEventListener("ended", onEnd);
    if (duration > 0) {
      setTimeout(() => { if (!video.ended) { try { video.pause(); } catch {} resolve(); } }, duration * 1000 * 3 + 5000);
    }
  });

  const wallElapsed = (performance.now() - wallStart) / 1000;
  console.log("[export] source duration", duration, "wall elapsed", wallElapsed.toFixed(2));

  stopReq = true;
  if (rafId) cancelAnimationFrame(rafId);
  try { recorder.stop(); } catch {}
  await stopped;

  onProgress?.(97, "Finalizando arquivo");

  const blob = new Blob(chunks, { type: mime.split(";")[0] });
  if (blob.size === 0) throw new Error("Renderização produziu arquivo vazio.");

  // Sanity-check exported duration matches source duration (within 15%).
  try {
    const check = document.createElement("video");
    check.preload = "metadata";
    check.src = URL.createObjectURL(blob);
    const outDur = await new Promise<number>((res) => {
      check.onloadedmetadata = () => res(check.duration);
      check.onerror = () => res(0);
      setTimeout(() => res(0), 4000);
    });
    URL.revokeObjectURL(check.src);
    console.log("[export] output duration ->", outDur, "expected ~", duration);
    if (duration > 0 && outDur > 0 && Math.abs(outDur - duration) / duration > 0.15) {
      console.warn("[export] duration mismatch — possible speed drift", { outDur, duration });
    }
  } catch { /* ignore */ }

  try { video.pause(); video.src = ""; video.load(); } catch {}
  if (tplVideo) { try { tplVideo.pause(); tplVideo.src = ""; tplVideo.load(); } catch {} }

  return { blob, mime: mime.split(";")[0], extension: ext, durationSeconds: duration };
}


