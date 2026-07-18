// Client-side MP4 composition renderer.
// Renders original video + template overlay + text layers + original audio into
// a single MP4 (H.264/AAC) using WebCodecs through Mediabunny. No WEBM output.

import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSink,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  type AudioCodec,
  type InputAudioTrack,
  type InputVideoTrack,
  type VideoCodec,
  type VideoSample,
} from "mediabunny";

export type BlendMode =
  | "normal" | "multiply" | "screen" | "overlay"
  | "lighten" | "darken" | "soft-light" | "hard-light";

export type TextAlign = "left" | "center" | "right";
export type TextTransform = "none" | "uppercase" | "lowercase" | "capitalize";

export type CompText = {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
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
  templateOpts?: { opacity: number; blend: BlendMode; fit: "contain" | "cover"; x?: number; y?: number; scale?: number };
  texts: CompText[];
  onProgress?: (pct: number, phase: string) => void;
};

export type CompositionResult = {
  blob: Blob;
  mime: string;
  extension: "mp4";
  durationSeconds: number;
  sourceFps: number;
  outputFps: number;
  hasAudio: boolean;
};

type SourceMeta = {
  duration: number;
  fps: number;
  hasAudio: boolean;
  audioCodec: AudioCodec | null;
  videoCodec: VideoCodec | null;
};

const MP4_MIME = "video/mp4";
const VIDEO_CODEC: VideoCodec = "avc";
const AUDIO_CODEC: AudioCodec = "aac";

const fetchMediaBlob = async (url: string, label: string): Promise<Blob> => {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error(`Falha ao carregar ${label} (${response.status}).`);
  const blob = await response.blob();
  if (!blob || blob.size === 0) throw new Error(`${label} está vazio ou inacessível.`);
  return blob;
};

const createInput = (blob: Blob) => new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar imagem do template."));
    img.src = url;
  });

const drawContainCover = (
  draw: (x: number, y: number, w: number, h: number) => void,
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
  if (fit === "contain" ? sr > dr : sr < dr) h = dw / sr;
  else w = dh * sr;
  draw((dw - w) / 2, (dh - h) / 2, w, h);
};

const drawImageContainCover = (
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  fit: "contain" | "cover",
) => drawContainCover((x, y, w, h) => ctx.drawImage(src, x, y, w, h), sw, sh, dw, dh, fit);

const drawSampleContainCover = (
  ctx: CanvasRenderingContext2D,
  sample: VideoSample,
  dw: number,
  dh: number,
  fit: "contain" | "cover",
) => drawContainCover(
  (x, y, w, h) => sample.draw(ctx, x, y, w, h),
  sample.displayWidth || sample.codedWidth,
  sample.displayHeight || sample.codedHeight,
  dw,
  dh,
  fit,
);

const applyTransformText = (t: string, mode?: TextTransform) => {
  if (!mode || mode === "none") return t;
  if (mode === "uppercase") return t.toUpperCase();
  if (mode === "lowercase") return t.toLowerCase();
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
};

const drawText = (ctx: CanvasRenderingContext2D, t: CompText, W: number, H: number, scale: number) => {
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

  const measureLine = (line: string) => {
    if (!letterSpacing) return ctx.measureText(line).width;
    let w = 0;
    for (const ch of line) w += ctx.measureText(ch).width + letterSpacing;
    return Math.max(0, w - letterSpacing);
  };

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

  if (t.shadow !== false) {
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 8 * scale;
    ctx.shadowOffsetY = 2 * scale;
  } else {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
  }

  if (t.strokeWidth && t.strokeWidth > 0) {
    ctx.strokeStyle = t.strokeColor ?? "#000";
    ctx.lineWidth = t.strokeWidth * scale * 2;
    ctx.lineJoin = "round";
    lines.forEach((line, i) => drawLineWithSpacing(line, cx, cy - totalHeight / 2 + lineHeight * (i + 0.5), true));
  }

  ctx.fillStyle = t.color || "#fff";
  lines.forEach((line, i) => drawLineWithSpacing(line, cx, cy - totalHeight / 2 + lineHeight * (i + 0.5), false));

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
};

const getSourceMeta = async (input: Input, videoTrack: InputVideoTrack, audioTrack: InputAudioTrack | null): Promise<SourceMeta> => {
  const [duration, stats, videoCodec, audioCodec] = await Promise.all([
    input.computeDuration(),
    videoTrack.computePacketStats(180).catch(() => null),
    videoTrack.getCodec().catch(() => null),
    audioTrack?.getCodec().catch(() => null) ?? Promise.resolve(null),
  ]);
  const fps = stats?.averagePacketRate && isFinite(stats.averagePacketRate)
    ? Math.min(120, Math.max(15, stats.averagePacketRate))
    : 30;
  return { duration: isFinite(duration) && duration > 0 ? duration : 0, fps, hasAudio: Boolean(audioTrack), audioCodec, videoCodec };
};

const validatePlayableMp4 = (blob: Blob): Promise<number> =>
  new Promise((resolve, reject) => {
    const el = document.createElement("video");
    const url = URL.createObjectURL(blob);
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("MP4 final não carregou no player de validação."));
    }, 8000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      el.onloadeddata = null;
      el.onerror = null;
      URL.revokeObjectURL(url);
      el.removeAttribute("src");
      el.load();
    };
    el.preload = "auto";
    el.muted = true;
    el.playsInline = true;
    el.onloadeddata = () => {
      const duration = el.duration;
      cleanup();
      if (!isFinite(duration) || duration <= 0) reject(new Error("MP4 final não possui duração válida."));
      else resolve(duration);
    };
    el.onerror = () => {
      cleanup();
      reject(new Error("MP4 final não é reproduzível neste navegador."));
    };
    el.src = url;
    el.load();
  });

const validateFinalMp4 = async (blob: Blob, source: SourceMeta) => {
  if (blob.type && !blob.type.startsWith(MP4_MIME)) throw new Error("Exportação inválida: o arquivo final não é MP4.");
  if (blob.size <= 0) throw new Error("Exportação inválida: arquivo MP4 final vazio.");

  const playableDuration = await validatePlayableMp4(blob);
  const outputInput = createInput(blob);
  const [videoTrack, audioTrack] = await Promise.all([
    outputInput.getPrimaryVideoTrack(),
    outputInput.getPrimaryAudioTrack(),
  ]);

  if (!videoTrack) throw new Error("MP4 final não contém trilha de vídeo.");
  if (source.hasAudio && !audioTrack) throw new Error("MP4 final não contém o áudio original.");

  const [videoCodec, audioCodec, duration, stats, audioDuration] = await Promise.all([
    videoTrack.getCodec(),
    audioTrack?.getCodec() ?? Promise.resolve(null),
    outputInput.computeDuration(),
    videoTrack.computePacketStats(180).catch(() => null),
    audioTrack?.computeDuration().catch(() => null) ?? Promise.resolve(null),
  ]);

  if (videoCodec !== VIDEO_CODEC) throw new Error("MP4 final não está em H.264.");
  if (source.hasAudio && audioCodec !== AUDIO_CODEC) throw new Error("MP4 final não está com áudio AAC.");

  const finalDuration = isFinite(duration) && duration > 0 ? duration : playableDuration;
  const durationTolerance = Math.max(0.3, source.duration * 0.025);
  if (source.duration > 0 && Math.abs(finalDuration - source.duration) > durationTolerance) {
    throw new Error("Duração do MP4 final diverge do vídeo original.");
  }
  if (source.hasAudio && audioDuration && Math.abs(audioDuration - finalDuration) > Math.max(0.35, finalDuration * 0.025)) {
    throw new Error("Áudio e vídeo do MP4 final estão com durações diferentes.");
  }

  const outputFps = stats?.averagePacketRate && isFinite(stats.averagePacketRate) ? stats.averagePacketRate : source.fps;
  const fpsTolerance = Math.max(1, source.fps * 0.06);
  if (Math.abs(outputFps - source.fps) > fpsTolerance) throw new Error("FPS do MP4 final diverge do vídeo original.");

  return { duration: finalDuration, fps: outputFps, hasAudio: Boolean(audioTrack) };
};

export async function renderComposition(input: CompositionInput): Promise<CompositionResult> {
  const { videoUrl, templateUrl, templateKind, ratio, texts, onProgress } = input;
  const videoTransform = input.videoTransform ?? { zoom: 1, x: 0, y: 0 };
  const templateOpts = input.templateOpts ?? { opacity: 1, blend: "normal" as BlendMode, fit: "contain" as const };

  onProgress?.(2, "Preparando vídeo");

  const sourceBlob = await fetchMediaBlob(videoUrl, "vídeo original");
  const sourceInput = createInput(sourceBlob);
  const [sourceVideoTrack, sourceAudioTrack] = await Promise.all([
    sourceInput.getPrimaryVideoTrack(),
    sourceInput.getPrimaryAudioTrack(),
  ]);
  if (!sourceVideoTrack) throw new Error("Vídeo original não contém trilha de vídeo válida.");

  const sourceMeta = await getSourceMeta(sourceInput, sourceVideoTrack, sourceAudioTrack);
  

  onProgress?.(8, "Carregando template");
  let tplImage: HTMLImageElement | null = null;
  let tplSink: CanvasSink | null = null;
  let tplDuration = 0;
  if (templateUrl) {
    if (templateKind === "video") {
      const templateBlob = await fetchMediaBlob(templateUrl, "template em vídeo");
      const templateInput = createInput(templateBlob);
      const templateVideoTrack = await templateInput.getPrimaryVideoTrack();
      if (templateVideoTrack) {
        tplSink = new CanvasSink(templateVideoTrack, { alpha: true, poolSize: 3 });
        tplDuration = await templateInput.computeDuration().catch(() => 0);
      }
    } else {
      tplImage = await loadImage(templateUrl);
    }
  }

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
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D não disponível.");

  const scale = Math.min(W, H) / 1080;

  const renderFrame = async (sample: VideoSample) => {
    ctx.save();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    const zoom = videoTransform.zoom || 1;
    const tx = (videoTransform.x / 100) * W;
    const ty = (videoTransform.y / 100) * H;
    ctx.save();
    ctx.translate(W / 2 + tx, H / 2 + ty);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);
    drawSampleContainCover(ctx, sample, W, H, "cover");
    ctx.restore();

    if (tplImage || tplSink) {
      ctx.save();
      ctx.globalAlpha = templateOpts.opacity;
      ctx.globalCompositeOperation = (templateOpts.blend === "normal" ? "source-over" : templateOpts.blend) as GlobalCompositeOperation;
      const ox = ((templateOpts.x ?? 0) / 100) * W;
      const oy = ((templateOpts.y ?? 0) / 100) * H;
      ctx.translate(ox, oy);
      if (tplImage) {
        drawImageContainCover(ctx, tplImage, tplImage.naturalWidth, tplImage.naturalHeight, W, H, templateOpts.fit);
      } else if (tplSink) {
        const tplTime = tplDuration > 0 ? ((sample.timestamp % tplDuration) + tplDuration) % tplDuration : Math.max(0, sample.timestamp);
        const wrapped = await tplSink.getCanvas(tplTime);
        if (wrapped?.canvas) drawImageContainCover(ctx, wrapped.canvas, wrapped.canvas.width, wrapped.canvas.height, W, H, templateOpts.fit);
      }
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    for (const t of texts) drawText(ctx, t, W, H, scale);
    ctx.restore();
    ctx.restore();

    return canvas;
  };

  onProgress?.(18, "Renderizando");

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const conversion = await Conversion.init({
    input: sourceInput,
    output,
    tracks: "primary",
    video: {
      codec: VIDEO_CODEC,
      bitrate: QUALITY_HIGH,
      frameRate: sourceMeta.fps,
      keyFrameInterval: 2,
      forceTranscode: true,
      allowRotationMetadata: false,
      processedWidth: W,
      processedHeight: H,
      process: async (sample) => renderFrame(sample),
    },
    audio: sourceMeta.hasAudio ? { codec: AUDIO_CODEC, bitrate: 192_000, forceTranscode: true } : { discard: true },
    showWarnings: true,
  });

  if (!conversion.isValid) {
    console.error("[export] invalid MP4 conversion", conversion.discardedTracks);
    const codecIssue = conversion.discardedTracks.find((t) => t.reason === "no_encodable_target_codec");
    if (codecIssue) throw new Error("Este navegador não consegue gerar MP4 H.264/AAC para este vídeo.");
    throw new Error("Não foi possível preparar a renderização MP4 final.");
  }

  conversion.onProgress = (progress, processedTime) => {
    onProgress?.(Math.min(94, 18 + progress * 76), "Renderizando");
    
  };

  await conversion.execute();
  onProgress?.(95, "Validando MP4");

  if (!target.buffer || target.buffer.byteLength === 0) throw new Error("Renderização produziu arquivo MP4 vazio.");
  const blob = new Blob([target.buffer], { type: MP4_MIME });
  const validation = await validateFinalMp4(blob, sourceMeta);
  const muxedMime = await output.getMimeType().catch(() => MP4_MIME);


  onProgress?.(97, "Finalizando arquivo");

  return {
    blob,
    mime: MP4_MIME,
    extension: "mp4",
    durationSeconds: validation.duration,
    sourceFps: sourceMeta.fps,
    outputFps: validation.fps,
    hasAudio: validation.hasAudio,
  };
}