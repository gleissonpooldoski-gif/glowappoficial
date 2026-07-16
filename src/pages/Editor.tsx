import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Save, Rocket, Type, Plus, Trash2, Loader2, Layers, Copy,
  Palette, Image as ImageIcon, ZoomIn, ZoomOut, Move, Play, Pause, Volume2, VolumeX, Maximize2, SkipBack, SkipForward,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, MessageSquareText } from "lucide-react";
import { TEXT_CATEGORIES, TEXT_PRESETS, type TextPreset, type TextPresetCategory } from "@/lib/text-library";
import { cn } from "@/lib/utils";

type TextTransform = "none" | "uppercase" | "lowercase" | "capitalize";
type TextAlign = "left" | "center" | "right";

type TextEl = {
  id: string;
  text: string;
  x: number; // 0-100 %
  y: number;
  size: number; // px
  color: string;
  font: string;
  weight: number;
  animation: "none" | "fade" | "slide-up" | "pulse";
  transform?: TextTransform;
  letterSpacing?: number; // px
  lineHeight?: number; // unitless
  align?: TextAlign;
  shadow?: boolean;
  strokeWidth?: number; // px
  strokeColor?: string;
  bgColor?: string | null; // background chip; null = transparent
};

type BlendMode =
  | "normal" | "multiply" | "screen" | "overlay" | "lighten" | "darken" | "soft-light" | "hard-light";

type EditDoc = {
  video: { zoom: number; x: number; y: number };
  template: { opacity: number; blend: BlendMode; fit: "contain" | "cover" };
  texts: TextEl[];
  colors: { primary: string; secondary: string };
  logo_url?: string | null;
};

type LoadError = {
  title: string;
  reason: string;
  url?: string | null;
};

const RATIOS: Record<string, { w: number; h: number; label: string }> = {
  "9:16": { w: 9, h: 16, label: "9:16 TikTok/Reels" },
  "16:9": { w: 16, h: 9, label: "16:9 YouTube" },
  "1:1": { w: 1, h: 1, label: "1:1 Instagram" },
};

const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: "normal", label: "Normal (usa alpha do template)" },
  { value: "screen", label: "Screen (clareia)" },
  { value: "multiply", label: "Multiply (escurece)" },
  { value: "overlay", label: "Overlay" },
  { value: "lighten", label: "Lighten" },
  { value: "darken", label: "Darken" },
  { value: "soft-light", label: "Soft light" },
  { value: "hard-light", label: "Hard light" },
];

const FONTS = [
  "Montserrat", "Inter", "Poppins", "Roboto",
  "Bebas Neue", "Oswald", "Anton", "Impact",
  "Playfair Display",
];

const TRANSFORM_OPTIONS: { value: TextTransform; label: string; sample: string }[] = [
  { value: "none", label: "Normal", sample: "Aa" },
  { value: "uppercase", label: "MAIÚSCULO", sample: "AA" },
  { value: "lowercase", label: "minúsculo", sample: "aa" },
  { value: "capitalize", label: "Título", sample: "Aa" },
];

const defaultDoc: EditDoc = {
  video: { zoom: 1, x: 0, y: 0 },
  template: { opacity: 1, blend: "normal", fit: "contain" },
  texts: [],
  colors: { primary: "#D4AF37", secondary: "#FFFFFF" },
};

const safeDoc = (value: unknown): EditDoc => {
  const raw = (value ?? {}) as Partial<EditDoc>;
  return {
    ...defaultDoc,
    ...raw,
    video: { ...defaultDoc.video, ...(raw.video ?? {}) },
    template: { ...defaultDoc.template, ...(raw.template ?? {}) },
    colors: { ...defaultDoc.colors, ...(raw.colors ?? {}) },
    texts: Array.isArray(raw.texts) ? raw.texts : [],
  };
};


const mediaErrorReason = (video: HTMLVideoElement) => {
  const code = video.error?.code;
  if (code === MediaError.MEDIA_ERR_ABORTED) return "Carregamento do vídeo foi interrompido pelo navegador.";
  if (code === MediaError.MEDIA_ERR_NETWORK) return "Falha de rede ao baixar o vídeo.";
  if (code === MediaError.MEDIA_ERR_DECODE) return "O navegador não conseguiu decodificar o arquivo de vídeo.";
  if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) return "Arquivo encontrado, mas o formato ou codec do vídeo não é suportado pelo player deste navegador.";
  return video.error?.message || "Falha desconhecida no player de vídeo.";
};

const preloadVideo = (url: string) => new Promise<void>((resolve, reject) => {
  const el = document.createElement("video");
  const timeout = window.setTimeout(() => {
    cleanup();
    reject(new Error("Tempo limite excedido ao carregar o vídeo."));
  }, 15000);
  const cleanup = () => {
    window.clearTimeout(timeout);
    el.onloadeddata = null;
    el.onerror = null;
    el.removeAttribute("src");
    el.load();
  };
  el.preload = "auto";
  el.muted = true;
  el.playsInline = true;
  el.onloadeddata = () => {
    cleanup();
    resolve();
  };
  el.onerror = () => {
    const reason = mediaErrorReason(el);
    cleanup();
    reject(new Error(reason));
  };
  el.src = url;
  el.load();
});

const preloadImage = (url: string) => new Promise<void>((resolve, reject) => {
  const img = new Image();
  const timeout = window.setTimeout(() => {
    cleanup();
    reject(new Error("Tempo limite excedido ao carregar o template."));
  }, 15000);
  const cleanup = () => {
    window.clearTimeout(timeout);
    img.onload = null;
    img.onerror = null;
  };
  img.onload = () => {
    cleanup();
    resolve();
  };
  img.onerror = () => {
    cleanup();
    reject(new Error("Arquivo de template inacessível ou inválido."));
  };
  img.src = url;
});

export default function Editor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [video, setVideo] = useState<any>(null);
  const [template, setTemplate] = useState<any>(null);
  const [doc, setDoc] = useState<EditDoc>(defaultDoc);
  const [ratio, setRatio] = useState<string>("9:16");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryCategory, setLibraryCategory] = useState<TextPresetCategory>("cta_comment");
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const resizeRef = useRef<{ id: string; sx: number; sy: number; base: number } | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; sx: number; sy: number; px: number; py: number } | null>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [templateUrl, setTemplateUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [videoReady, setVideoReady] = useState(false);

  // Áudio / playback do vídeo original
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [hasAudioTrack, setHasAudioTrack] = useState<boolean | null>(null);
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<number | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  const revealControls = () => {
    setShowControls(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false);
    }, 2200);
  };

  const requestFullscreen = () => {
    const el = canvasWrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => {});
  };



  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => setCurrentTime(el.currentTime);
    const onMeta = () => {
      setDuration(el.duration || 0);
      const anyEl = el as any;
      const tracks = anyEl.mozHasAudio ?? (anyEl.webkitAudioDecodedByteCount ? anyEl.webkitAudioDecodedByteCount > 0 : null) ?? (anyEl.audioTracks ? anyEl.audioTracks.length > 0 : null);
      setHasAudioTrack(tracks);
    };
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
    };
  }, [videoUrl]);

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch((err) => console.error("[Editor] play failed", err));
    } else {
      el.pause();
    }
  };

  const seekTo = (t: number) => {
    const el = videoRef.current;
    if (!el) return;
    const d = el.duration && isFinite(el.duration) ? el.duration : duration;
    const clamped = Math.max(0, Math.min(d || 0, t));
    try { el.currentTime = clamped; } catch (err) { console.error("[Editor] seek failed", err); }
    setCurrentTime(clamped);
  };
  const skip = (delta: number) => seekTo((videoRef.current?.currentTime ?? currentTime) + delta);

  const toggleMute = () => {
    const el = videoRef.current;
    if (!el) return;
    const next = !el.muted;
    el.muted = next;
    setIsMuted(next);
  };

  const onVolume = (v: number) => {
    setVolume(v);
    if (videoRef.current) {
      videoRef.current.volume = v;
      videoRef.current.muted = v === 0;
      setIsMuted(v === 0);
    }
  };

  const formatTime = (t: number) => {
    if (!isFinite(t)) return "0:00";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      console.log("[Editor] loading edit", id);
      const { data, error } = await (supabase as any)
        .from("edits").select("*").eq("id", id).maybeSingle();
      if (error || !data) {
        console.error("[Editor] edit not found", error);
        toast.error("Projeto de edição não encontrado");
        navigate("/edits");
        return;
      }
      console.log("[Editor] edit ->", {
        video_id: data.video_id,
        video_url: data.video_url,
        video_filename: data.video_filename,
        video_storage_path: data.video_storage_path,
        owner_user_id: data.owner_user_id,
        template_id: data.template_id,
        template_url: data.template_url,
        user_id: data.user_id,
        status: data.status,
      });

      if (!data.video_id) {
        setLoadError({
          title: "Erro ao carregar vídeo",
          reason: "Este projeto não tem vídeo associado. Volte à biblioteca e recrie a edição.",
          url: data.video_url,
        });
        setEdit(data);
        setLoading(false);
        return;
      }

      setEdit(data);
      setRatio(data.aspect_ratio ?? "9:16");
      setDoc(safeDoc(data.doc));

      console.log("Carregando vídeo...");
      const { data: v, error: vErr } = await supabase
        .from("videos")
        .select("*")
        .eq("id", data.video_id)
        .maybeSingle();

      if (vErr) console.error("[Editor] video fetch error", vErr);
      console.log("[Editor] video row ->", v ? {
        id: v.id,
        filename: v.filename,
        original_path: v.original_path,
        original_url: v.original_url,
        mime_type: v.mime_type,
        status: v.status,
      } : null);

      if (!v) {
        console.error("Erro ao buscar vídeo", vErr);
        setLoadError({
          title: "Erro ao carregar vídeo",
          reason: vErr?.message ?? "Vídeo original não encontrado no banco (pode ter sido excluído).",
          url: data.video_url,
        });
        setLoading(false);
        return;
      }
      if (!v.original_path && !v.original_url && !data.video_url) {
        console.error("Erro ao buscar vídeo", "URL/caminho vazio");
        setLoadError({
          title: "Erro ao carregar vídeo",
          reason: "O vídeo não tem arquivo original armazenado nem URL salva no projeto.",
          url: data.video_url ?? v.original_url,
        });
        setVideo(v);
        setLoading(false);
        return;
      }

      setVideo(v);

      let nextVideoUrl = data.video_url ?? v.original_url ?? null;
      if (v.original_path) {
        const { data: signed, error: signErr } = await supabase.storage
          .from("videos")
          .createSignedUrl(v.original_path, 60 * 60 * 6);
        if (signErr || !signed?.signedUrl) {
          console.error("[Editor] createSignedUrl failed", signErr, "path:", v.original_path);
          setLoadError({
            title: "Erro ao carregar vídeo",
            reason: `Não foi possível gerar URL assinada do vídeo (${signErr?.message ?? "sem permissão"}).`,
            url: nextVideoUrl,
          });
          setLoading(false);
          return;
        }
        nextVideoUrl = signed.signedUrl;
      }
      if (!nextVideoUrl) {
        setLoadError({
          title: "Erro ao carregar vídeo",
          reason: "URL do vídeo está vazia.",
          url: null,
        });
        setLoading(false);
        return;
      }

      console.log("URL do vídeo encontrada", nextVideoUrl);
      setVideoUrl(nextVideoUrl);

      // ----- Template (overlay) -----
      let nextTemplateUrl: string | null = data.template_url ?? null;
      if (data.template_id) {
        const { data: tpl, error: tplErr } = await (supabase as any)
          .from("templates").select("*").eq("id", data.template_id).maybeSingle();
        if (tplErr) console.error("[Editor] template fetch error", tplErr);
        console.log("[Editor] template row ->", tpl);
        if (tpl) {
          setTemplate(tpl);
          if (!nextTemplateUrl) {
            const path = tpl.file_path ?? tpl.storage_path ?? tpl.path;
            if (path) {
              const { data: tSigned, error: tSignErr } = await supabase.storage
                .from("templates")
                .createSignedUrl(path, 60 * 60 * 6);
              if (tSignErr) console.error("[Editor] template signed url error", tSignErr);
              nextTemplateUrl = tSigned?.signedUrl ?? tpl.preview_url ?? tpl.file_url ?? null;
            } else {
              nextTemplateUrl = tpl.preview_url ?? tpl.file_url ?? null;
            }
          }
        }
      }
      setTemplateUrl(nextTemplateUrl);
      console.log("[Editor] template URL ->", nextTemplateUrl);

      const { error: urlUpdateErr } = await (supabase as any).from("edits").update({
        video_url: nextVideoUrl,
        video_filename: v.filename,
        video_storage_path: v.original_path,
        template_url: nextTemplateUrl,
        user_id: data.user_id ?? "single-user",
        owner_user_id: data.owner_user_id ?? "single-user",
        status: "editing",
      }).eq("id", id);
      if (urlUpdateErr) console.error("[Editor] edit url update error", urlUpdateErr);

      setLoading(false);
    })();
  }, [id, navigate]);



  const selectedText = useMemo(
    () => doc.texts.find((t) => t.id === selectedTextId) ?? null,
    [doc.texts, selectedTextId],
  );

  const updateText = (tid: string, patch: Partial<TextEl>) => {
    setDoc((d) => ({ ...d, texts: d.texts.map((t) => (t.id === tid ? { ...t, ...patch } : t)) }));
  };

  const addText = () => {
    const t: TextEl = {
      id: crypto.randomUUID(),
      text: "Novo texto",
      x: 50, y: 50, size: 42, color: doc.colors.secondary,
      font: "Montserrat", weight: 700, animation: "none",
      transform: "none", letterSpacing: 0, lineHeight: 1.2, align: "center",
      shadow: true, strokeWidth: 0, strokeColor: "#000000", bgColor: null,
    };
    setDoc((d) => ({ ...d, texts: [...d.texts, t] }));
    setSelectedTextId(t.id);
  };

  const addPreset = (p: TextPreset) => {
    const t: TextEl = {
      id: crypto.randomUUID(),
      text: p.text,
      x: 50, y: 80,
      size: p.size ?? 44,
      color: doc.colors.secondary,
      font: "Montserrat",
      weight: p.weight ?? 800,
      animation: p.animation ?? "fade",
      transform: "uppercase", letterSpacing: 1, lineHeight: 1.15, align: "center",
      shadow: true, strokeWidth: 0, strokeColor: "#000000", bgColor: null,
    };
    setDoc((d) => ({ ...d, texts: [...d.texts, t] }));
    setSelectedTextId(t.id);
    toast.success("Texto adicionado ao vídeo");
  };


  const removeText = (tid: string) => {
    setDoc((d) => ({ ...d, texts: d.texts.filter((t) => t.id !== tid) }));
    if (selectedTextId === tid) setSelectedTextId(null);
    toast.success("Texto excluído");
  };

  const duplicateText = (tid: string) => {
    setDoc((d) => {
      const src = d.texts.find((t) => t.id === tid);
      if (!src) return d;
      const copy: TextEl = { ...src, id: crypto.randomUUID(), x: Math.min(100, src.x + 4), y: Math.min(100, src.y + 4) };
      setSelectedTextId(copy.id);
      return { ...d, texts: [...d.texts, copy] };
    });
  };

  const onStagePointerDown = (e: React.PointerEvent, tid: string) => {
    e.stopPropagation();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const t = doc.texts.find((x) => x.id === tid);
    if (!t) return;
    setSelectedTextId(tid);
    dragRef.current = { id: tid, sx: e.clientX, sy: e.clientY, px: t.x, py: t.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onStagePointerMove = (e: React.PointerEvent) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const r = resizeRef.current;
    if (r) {
      const dy = e.clientY - r.sy;
      const dx = e.clientX - r.sx;
      const delta = Math.max(dx, dy);
      const next = Math.max(12, Math.min(240, Math.round(r.base + delta * 0.6)));
      updateText(r.id, { size: next });
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    const dx = ((e.clientX - d.sx) / rect.width) * 100;
    const dy = ((e.clientY - d.sy) / rect.height) * 100;
    updateText(d.id, {
      x: Math.max(0, Math.min(100, d.px + dx)),
      y: Math.max(0, Math.min(100, d.py + dy)),
    });
  };

  const onStagePointerUp = () => { dragRef.current = null; resizeRef.current = null; };

  const startResize = (e: React.PointerEvent, tid: string) => {
    e.stopPropagation();
    const t = doc.texts.find((x) => x.id === tid);
    if (!t) return;
    resizeRef.current = { id: tid, sx: e.clientX, sy: e.clientY, base: t.size };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const save = async (silent = false) => {
    if (!id) return;
    setSaving(true);
    const { error } = await (supabase as any).from("edits")
      .update({ doc, aspect_ratio: ratio, status: "editing" }).eq("id", id);
    setSaving(false);
    if (error) { toast.error(error.message); return false; }
    if (!silent) toast.success("Rascunho salvo");
    return true;
  };

  type ExportPhase = "idle" | "prep" | "template" | "render" | "encode" | "upload";
  const PHASE_LABEL: Record<ExportPhase, string> = {
    idle: "",
    prep: "Preparando vídeo",
    template: "Aplicando template",
    render: "Renderizando",
    encode: "Codificando MP4",
    upload: "Finalizando arquivo",
  };
  const [exportPhase, setExportPhase] = useState<ExportPhase>("idle");
  const [exportPercent, setExportPercent] = useState(0);
  const exportProgress = exportPhase === "idle" ? null : PHASE_LABEL[exportPhase];

  const exportVideo = async () => {
    if (!id || !edit) return;
    if (!videoUrl) {
      toast.error("Vídeo original não está carregado.");
      return;
    }
    setExporting(true);
    setExportPhase("prep");
    setExportPercent(2);
    try {
      const okSave = await save(true);
      if (!okSave) return;

      const outRatio = RATIOS[ratio] ?? RATIOS["9:16"];
      // Output pixel dimensions
      const px = outRatio.w >= outRatio.h
        ? { width: 1920, height: Math.round((1920 * outRatio.h) / outRatio.w) }
        : { width: Math.round((1920 * outRatio.w) / outRatio.h), height: 1920 };

      const templateKind: "image" | "video" | null =
        template?.file_type?.startsWith("video/") ? "video"
        : template?.file_type?.startsWith("image/") ? "image"
        : templateUrl ? "image" : null;

      const { renderComposition } = await import("@/lib/exportComposition");
      const result = await renderComposition({
        videoUrl,
        templateUrl: templateUrl ?? null,
        templateKind,
        ratio: px,
        videoTransform: doc.video,
        templateOpts: doc.template,
        texts: doc.texts as any,
        onProgress: (pct, phase) => {
          setExportPercent(Math.round(pct));
          if (phase.includes("template")) setExportPhase("template");
          else if (phase.includes("Renderiz")) setExportPhase("render");
          else if (phase.includes("Final") || phase.includes("MP4")) setExportPhase("encode");
          else setExportPhase("prep");
        },
      });

      // Validate output before publishing: only MP4 H.264/AAC final files are allowed.
      if (!result.blob || result.blob.size === 0) {
        throw new Error("Arquivo renderizado ficou vazio.");
      }
      if (result.extension !== "mp4" || !result.mime.startsWith("video/mp4")) {
        throw new Error("Exportação inválida: somente arquivos MP4 finais podem ser salvos.");
      }

      setExportPhase("upload");
      setExportPercent(98);

      const stamp = Date.now();
      const base = (edit.name?.trim() || video?.filename || "video-final").replace(/\.[^.]+$/, "").replace(/[^\w.\-]+/g, "_");
      const finalName = `${base}.${result.extension}`;
      const processedPath = `exports/${id}/${stamp}-${finalName}`;

      const { error: upErr } = await supabase.storage
        .from("videos-processed")
        .upload(processedPath, result.blob, { contentType: result.mime, upsert: true });
      if (upErr) throw new Error(`Falha ao enviar arquivo final: ${upErr.message}`);

      // Confirm file exists in storage before creating DB row
      const { data: signedProbe, error: probeErr } = await supabase.storage
        .from("videos-processed")
        .createSignedUrl(processedPath, 60);
      if (probeErr || !signedProbe?.signedUrl) {
        throw new Error("Arquivo enviado mas não foi possível validar a URL final.");
      }

      const { data: finishedRow, error: insErr } = await (supabase as any)
        .from("videos")
        .insert({
          filename: finalName,
          mime_type: result.mime,
          status: "completed",
          progress: 100,
          project_id: edit.project_id,
          template_id: edit.template_id,
          duration_seconds: result.durationSeconds || video?.duration_seconds || null,
          size_bytes: result.blob.size,
          processed_path: processedPath,
          thumbnail_path: video?.thumbnail_path ?? null,
          thumbnail_url: video?.thumbnail_url ?? null,
        })
        .select("id")
        .single();
      if (insErr) throw new Error(`Falha ao registrar vídeo final: ${insErr.message}`);

      // Log a completed job for consistency (best-effort)
      try {
        await (supabase as any).from("render_jobs").insert({
          edit_id: id,
          project_id: edit.project_id,
          video_id: finishedRow.id,
          user_id: null,
          status: "COMPLETED",
          provider: "client-canvas",
          progress: 100,
          output_path: processedPath,
          completed_at: new Date().toISOString(),
        });
      } catch (e) {
        console.warn("[Editor] failed to log render_job", e);
      }

      await (supabase as any).from("edits").update({ status: "completed" }).eq("id", id);

      setExportPercent(100);
      toast.success("Vídeo pronto! Enviado para Vídeos Prontos.");
      setExporting(false);
      setExportPhase("idle");
      navigate("/finished");
    } catch (e: any) {
      console.error("[Editor] export failed", e);
      toast.error(e?.message ?? "Não foi possível renderizar o vídeo. Tente novamente.");
      setExporting(false);
      setExportPhase("idle");
      setExportPercent(0);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-3">
        <Loader2 className="animate-spin text-gold" />
        <p className="text-xs text-muted-foreground">Carregando vídeo e template…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto flex h-[70vh] max-w-lg flex-col items-center justify-center gap-3 text-center">
        <div className="rounded-full bg-destructive/10 p-3 text-destructive">
          <ArrowLeft size={18} />
        </div>
        <h2 className="text-lg font-semibold">{loadError.title}</h2>
        <p className="text-sm text-muted-foreground">{loadError.reason}</p>
        <div className="w-full rounded-md border border-border/50 bg-muted/30 p-2 text-left text-[11px] text-muted-foreground">
          <div className="mb-1 font-medium text-foreground">URL recebida</div>
          <div className="break-all">{loadError.url || "URL vazia"}</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/edits")}>
            <ArrowLeft size={14} className="mr-1" /> Meus projetos
          </Button>
          <Button size="sm" onClick={() => navigate("/videos")}>
            Ir para biblioteca
          </Button>
        </div>
      </div>
    );
  }

  const r = RATIOS[ratio] ?? RATIOS["9:16"];
  const videoSrc = videoUrl;
  const templateSrc = templateUrl;

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-3">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/videos")}>
            <ArrowLeft size={14} className="mr-1" /> Voltar
          </Button>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Editor de Vídeo</h1>
            <p className="text-xs text-muted-foreground">
              {video?.filename ?? "—"} · Template: {template?.name ?? "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={ratio} onValueChange={setRatio}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(RATIOS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => save()} disabled={saving}>
            {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />}
            Salvar rascunho
          </Button>
          <Button size="sm" className="bg-gold-gradient text-black glow-gold" onClick={exportVideo} disabled={exporting}>
            {exporting ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Rocket size={14} className="mr-1" />}
            {exporting ? (exportProgress ?? "Renderizando…") : "Exportar vídeo"}
          </Button>
        </div>
      </div>

      <div className="grid flex-1 gap-3 lg:grid-cols-[280px_1fr_320px]">
        {/* Left panel — layers / add */}
        <Card className="glass border-border/50">
          <CardContent className="space-y-3 p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Layers size={12} className="mr-1 inline" /> Camadas
              </h3>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addText}>
                <Plus size={12} className="mr-1" /> Texto
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-full justify-start border-gold/40 bg-gold/5 text-xs text-gold hover:bg-gold/10"
              onClick={() => setLibraryOpen(true)}
            >
              <MessageSquareText size={12} className="mr-2" />
              Textos e CTAs prontos
            </Button>
            <div className="space-y-1">
              <div className="rounded border border-border/40 bg-black/30 p-2 text-xs">
                🎬 Vídeo base
              </div>
              {template?.preview_url && (
                <div className="rounded border border-border/40 bg-black/30 p-2 text-xs">
                  🖼️ Template overlay
                </div>
              )}
              {doc.texts.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTextId(t.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded border p-2 text-left text-xs",
                    selectedTextId === t.id
                      ? "border-gold/60 bg-gold/10"
                      : "border-border/40 bg-black/30 hover:border-gold/30",
                  )}
                >
                  <span className="truncate">Aa {t.text}</span>
                  <Trash2
                    size={12}
                    className="shrink-0 text-destructive"
                    onClick={(e) => { e.stopPropagation(); removeText(t.id); }}
                  />
                </button>
              ))}
            </div>
            <Separator />
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Palette size={12} className="mr-1 inline" /> Cores do template
              </h3>
              <div className="flex items-center gap-2">
                <input type="color" value={doc.colors.primary}
                  onChange={(e) => setDoc((d) => ({ ...d, colors: { ...d.colors, primary: e.target.value } }))}
                  className="h-8 w-8 cursor-pointer rounded border border-border/40 bg-transparent" />
                <span className="text-xs">Primária</span>
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={doc.colors.secondary}
                  onChange={(e) => setDoc((d) => ({ ...d, colors: { ...d.colors, secondary: e.target.value } }))}
                  className="h-8 w-8 cursor-pointer rounded border border-border/40 bg-transparent" />
                <span className="text-xs">Secundária</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Center — canvas */}
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border/50 bg-black/60 p-4">
          <div
            ref={canvasWrapRef}
            className="group relative"
            onMouseMove={revealControls}
            onMouseEnter={revealControls}
            onMouseLeave={() => {
              if (videoRef.current && !videoRef.current.paused) setShowControls(false);
            }}
            style={{
              aspectRatio: `${r.w} / ${r.h}`,
              height: r.h >= r.w ? "min(78vh, 820px)" : undefined,
              width: r.w > r.h ? "min(82vw, 1100px)" : undefined,
            }}
          >
          <div
            ref={stageRef}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerUp}
            onPointerLeave={onStagePointerUp}
            onClick={() => { setSelectedTextId(null); revealControls(); }}
            className="relative h-full w-full overflow-hidden rounded-md bg-black shadow-2xl ring-1 ring-gold/20"
          >
            {/* Layer 1 — Vídeo original (fundo, opacidade total, sem blend) */}
            {videoSrc ? (
              <>
                <video
                  ref={videoRef}
                  src={videoSrc}
                  crossOrigin="anonymous"
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{
                    zIndex: 1,
                    opacity: 1,
                    mixBlendMode: "normal",
                    transform: `translate(${doc.video.x}%, ${doc.video.y}%) scale(${doc.video.zoom})`,
                    transformOrigin: "center",
                  }}
                  loop
                  playsInline
                  preload="auto"
                  onLoadedData={() => {
                    console.log("[Editor] <video> loaded data");
                    setVideoReady(true);
                  }}
                  onError={(e) => {
                    const el = e.currentTarget;
                    const reason = mediaErrorReason(el);
                    console.error("[Editor] <video> error", {
                      video_id: edit?.video_id,
                      url: videoSrc,
                      error: el.error,
                      reason,
                    });
                    setLoadError({ title: "Erro ao carregar vídeo", reason, url: videoSrc });
                  }}
                />
                {!videoReady && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 text-xs text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-gold" />
                    Carregando vídeo…
                  </div>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground" style={{ zIndex: 1 }}>
                Vídeo indisponível
              </div>
            )}
            {/* Layer 2 — Template overlay (acima do vídeo; alpha do arquivo é preservado, sem fundo sólido) */}
            {templateSrc && (template?.file_type ?? "").startsWith("image/") && (
              <img
                src={templateSrc}
                alt=""
                className={cn(
                  "pointer-events-none absolute inset-0 h-full w-full",
                  doc.template.fit === "cover" ? "object-cover" : "object-contain",
                )}
                style={{
                  zIndex: 2,
                  mixBlendMode: doc.template.blend,
                  opacity: doc.template.opacity,
                  background: "transparent",
                }}
              />
            )}
            {templateSrc && (template?.file_type ?? "").startsWith("video/") && (
              <video
                src={templateSrc}
                className={cn(
                  "pointer-events-none absolute inset-0 h-full w-full",
                  doc.template.fit === "cover" ? "object-cover" : "object-contain",
                )}
                style={{
                  zIndex: 2,
                  mixBlendMode: doc.template.blend,
                  opacity: doc.template.opacity,
                  background: "transparent",
                }}
                autoPlay muted loop playsInline
              />
            )}
            {doc.texts.map((t) => {
              const isSelected = selectedTextId === t.id;
              const isEditing = editingTextId === t.id;
              return (
                <div
                  key={t.id}
                  onPointerDown={(e) => {
                    if (isEditing) return;
                    onStagePointerDown(e, t.id);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTextId(t.id);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setSelectedTextId(t.id);
                    setEditingTextId(t.id);
                  }}
                  className={cn(
                    "absolute whitespace-pre",
                    isEditing ? "cursor-text select-text" : "cursor-move select-none",
                    isSelected && "outline outline-2 outline-gold/80",
                    !isEditing && t.animation === "fade" && "animate-fade-in",
                    !isEditing && t.animation === "pulse" && "animate-pulse",
                    !isEditing && t.animation === "slide-up" && "animate-[slide-up_0.6s_ease-out]",
                  )}
                  style={{
                    zIndex: 3,
                    left: `${t.x}%`, top: `${t.y}%`,
                    transform: "translate(-50%, -50%)",
                    fontFamily: `"${t.font}", sans-serif`,
                    fontSize: t.size,
                    color: t.color,
                    fontWeight: t.weight,
                    textTransform: t.transform ?? "none",
                    letterSpacing: t.letterSpacing != null ? `${t.letterSpacing}px` : undefined,
                    lineHeight: t.lineHeight ?? 1.2,
                    textAlign: t.align ?? "center",
                    textShadow: t.shadow === false ? "none" : "0 2px 8px rgba(0,0,0,0.6)",
                    WebkitTextStroke:
                      t.strokeWidth && t.strokeWidth > 0
                        ? `${t.strokeWidth}px ${t.strokeColor ?? "#000000"}`
                        : undefined,
                    backgroundColor: t.bgColor ?? "transparent",
                    padding: t.bgColor ? "6px 12px" : "4px 8px",
                    borderRadius: t.bgColor ? 8 : undefined,
                  }}
                >
                  {isEditing ? (
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      autoFocus
                      ref={(el) => {
                        if (el && document.activeElement !== el) {
                          el.focus();
                          const range = document.createRange();
                          range.selectNodeContents(el);
                          const sel = window.getSelection();
                          sel?.removeAllRanges();
                          sel?.addRange(range);
                        }
                      }}
                      onBlur={(e) => {
                        updateText(t.id, { text: e.currentTarget.textContent ?? "" });
                        setEditingTextId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          (e.currentTarget as HTMLElement).blur();
                        }
                      }}
                      className="outline-none"
                    >
                      {t.text || "Texto"}
                    </span>
                  ) : (
                    <>{t.text || "Texto"}</>
                  )}

                  {isSelected && !isEditing && (
                    <div
                      onPointerDown={(e) => startResize(e, t.id)}
                      className="absolute -bottom-2 -right-2 h-4 w-4 cursor-se-resize rounded-full border-2 border-gold bg-black shadow"
                      title="Arrastar para redimensionar"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Controles overlay estilo CapCut — aparecem no hover/click */}
          {videoSrc && (
            <div
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0 z-[5] flex flex-col gap-1 rounded-b-md bg-gradient-to-t from-black/85 via-black/60 to-transparent px-3 pb-2 pt-6 transition-opacity duration-200",
                showControls ? "opacity-100" : "opacity-0",
              )}
            >
              <input
                type="range" min={0} max={duration || 0} step={0.1}
                value={currentTime}
                onChange={(e) => {
                  const t = parseFloat(e.target.value);
                  if (videoRef.current) videoRef.current.currentTime = t;
                  setCurrentTime(t);
                }}
                onClick={(e) => e.stopPropagation()}
                className="pointer-events-auto h-1 w-full accent-gold"
              />
              <div className="pointer-events-auto flex items-center gap-2 text-white">
                <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10"
                  onClick={(e) => { e.stopPropagation(); togglePlay(); revealControls(); }}
                  title={isPlaying ? "Pausar" : "Reproduzir"}>
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10"
                  onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                  title={isMuted ? "Reativar áudio" : "Silenciar"}>
                  {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </Button>
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => onVolume(parseFloat(e.target.value))}
                  onClick={(e) => e.stopPropagation()}
                  className="h-1 w-20 accent-gold"
                />
                <span className="ml-2 font-mono text-[11px] text-white/80">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
                {hasAudioTrack === false && (
                  <span className="ml-2 text-[10px] text-white/60">sem áudio</span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10"
                    onClick={(e) => { e.stopPropagation(); requestFullscreen(); }}
                    title="Tela cheia">
                    <Maximize2 size={16} />
                  </Button>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>



        {/* Right panel — properties */}
        <Card className="glass border-border/50 overflow-y-auto">
          <CardContent className="p-3">
            <Tabs defaultValue="text">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="text" className="text-xs"><Type size={12} className="mr-1" />Texto</TabsTrigger>
                <TabsTrigger value="video" className="text-xs"><Move size={12} className="mr-1" />Vídeo</TabsTrigger>
                <TabsTrigger value="template" className="text-xs"><Layers size={12} className="mr-1" />Overlay</TabsTrigger>
                <TabsTrigger value="assets" className="text-xs"><ImageIcon size={12} className="mr-1" />Logo</TabsTrigger>
              </TabsList>

              <TabsContent value="text" className="mt-3 space-y-3">
                {selectedText ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 flex-1 text-xs"
                        onClick={() => duplicateText(selectedText.id)}
                      >
                        <Copy size={12} className="mr-1" /> Duplicar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 flex-1 border-destructive/40 text-xs text-destructive hover:bg-destructive/10"
                        onClick={() => removeText(selectedText.id)}
                      >
                        <Trash2 size={12} className="mr-1" /> Excluir texto
                      </Button>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Conteúdo</Label>
                      <Input value={selectedText.text}
                        onChange={(e) => updateText(selectedText.id, { text: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Fonte</Label>
                      <Select value={selectedText.font}
                        onValueChange={(v) => updateText(selectedText.id, { font: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FONTS.map((f) => (
                            <SelectItem key={f} value={f}>
                              <span style={{ fontFamily: `"${f}", sans-serif` }}>{f}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div
                        className="mt-1 rounded border border-border/40 bg-black/30 px-2 py-1 text-white"
                        style={{
                          fontFamily: `"${selectedText.font}", sans-serif`,
                          fontWeight: selectedText.weight,
                          textTransform: selectedText.transform ?? "none",
                        }}
                      >
                        {selectedText.text || "Prévia"}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Capitalização</Label>
                      <div className="grid grid-cols-4 gap-1">
                        {TRANSFORM_OPTIONS.map((opt) => {
                          const active = (selectedText.transform ?? "none") === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => updateText(selectedText.id, { transform: opt.value })}
                              className={cn(
                                "rounded-md border px-1 py-1.5 text-[10px] leading-tight transition",
                                active
                                  ? "border-gold bg-gold/15 text-gold"
                                  : "border-border/40 bg-transparent text-muted-foreground hover:border-gold/40",
                              )}
                              title={opt.label}
                            >
                              <div className="text-sm font-bold" style={{ textTransform: opt.value }}>
                                {opt.sample}
                              </div>
                              <div>{opt.label}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Tamanho: {selectedText.size}px</Label>
                      <Slider min={12} max={160} value={[selectedText.size]}
                        onValueChange={([v]) => updateText(selectedText.id, { size: v })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Peso: {selectedText.weight}</Label>
                      <Slider min={100} max={900} step={100} value={[selectedText.weight]}
                        onValueChange={([v]) => updateText(selectedText.id, { weight: v })} />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Alinhamento</Label>
                      <div className="grid grid-cols-3 gap-1">
                        {(["left", "center", "right"] as TextAlign[]).map((a) => {
                          const active = (selectedText.align ?? "center") === a;
                          return (
                            <button
                              key={a}
                              type="button"
                              onClick={() => updateText(selectedText.id, { align: a })}
                              className={cn(
                                "rounded-md border px-2 py-1.5 text-xs capitalize transition",
                                active
                                  ? "border-gold bg-gold/15 text-gold"
                                  : "border-border/40 text-muted-foreground hover:border-gold/40",
                              )}
                            >
                              {a === "left" ? "Esquerda" : a === "right" ? "Direita" : "Centro"}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        Espaçamento entre letras: {selectedText.letterSpacing ?? 0}px
                      </Label>
                      <Slider
                        min={-5} max={30} step={0.5}
                        value={[selectedText.letterSpacing ?? 0]}
                        onValueChange={([v]) => updateText(selectedText.id, { letterSpacing: v })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        Altura da linha: {(selectedText.lineHeight ?? 1.2).toFixed(2)}
                      </Label>
                      <Slider
                        min={0.8} max={2.5} step={0.05}
                        value={[selectedText.lineHeight ?? 1.2]}
                        onValueChange={([v]) => updateText(selectedText.id, { lineHeight: v })}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <input type="color" value={selectedText.color}
                        onChange={(e) => updateText(selectedText.id, { color: e.target.value })}
                        className="h-8 w-10 cursor-pointer rounded border border-border/40 bg-transparent" />
                      <Label className="text-xs">Cor do texto</Label>
                    </div>

                    <div className="space-y-1.5 rounded-md border border-border/40 p-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Contorno: {selectedText.strokeWidth ?? 0}px</Label>
                        <input
                          type="color"
                          value={selectedText.strokeColor ?? "#000000"}
                          onChange={(e) => updateText(selectedText.id, { strokeColor: e.target.value })}
                          className="h-6 w-8 cursor-pointer rounded border border-border/40 bg-transparent"
                        />
                      </div>
                      <Slider
                        min={0} max={8} step={0.5}
                        value={[selectedText.strokeWidth ?? 0]}
                        onValueChange={([v]) => updateText(selectedText.id, { strokeWidth: v })}
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-md border border-border/40 p-2">
                      <Label className="text-xs">Sombra do texto</Label>
                      <button
                        type="button"
                        onClick={() => updateText(selectedText.id, { shadow: !(selectedText.shadow ?? true) })}
                        className={cn(
                          "rounded-full px-3 py-1 text-[10px] transition",
                          (selectedText.shadow ?? true)
                            ? "bg-gold/20 text-gold"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {(selectedText.shadow ?? true) ? "Ativa" : "Desligada"}
                      </button>
                    </div>

                    <div className="space-y-1.5 rounded-md border border-border/40 p-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Fundo do texto</Label>
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={selectedText.bgColor ?? "#000000"}
                            onChange={(e) => updateText(selectedText.id, { bgColor: e.target.value })}
                            className="h-6 w-8 cursor-pointer rounded border border-border/40 bg-transparent"
                          />
                          <button
                            type="button"
                            onClick={() => updateText(selectedText.id, { bgColor: null })}
                            className="rounded border border-border/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:border-gold/40"
                          >
                            Sem fundo
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Animação</Label>
                      <Select value={selectedText.animation}
                        onValueChange={(v: any) => updateText(selectedText.id, { animation: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhuma</SelectItem>
                          <SelectItem value="fade">Fade in</SelectItem>
                          <SelectItem value="slide-up">Slide up</SelectItem>
                          <SelectItem value="pulse">Pulsar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Pos X: {Math.round(selectedText.x)}%</Label>
                        <Slider min={0} max={100} value={[selectedText.x]}
                          onValueChange={([v]) => updateText(selectedText.id, { x: v })} />
                      </div>
                      <div>
                        <Label className="text-xs">Pos Y: {Math.round(selectedText.y)}%</Label>
                        <Slider min={0} max={100} value={[selectedText.y]}
                          onValueChange={([v]) => updateText(selectedText.id, { y: v })} />
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    Selecione um texto ou clique em "+ Texto".
                  </p>
                )}
              </TabsContent>

              <TabsContent value="video" className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    <ZoomIn size={12} className="mr-1 inline" />
                    Zoom: {doc.video.zoom.toFixed(2)}x
                  </Label>
                  <Slider min={0.5} max={3} step={0.05} value={[doc.video.zoom]}
                    onValueChange={([v]) => setDoc((d) => ({ ...d, video: { ...d.video, zoom: v } }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Posição X: {doc.video.x}%</Label>
                  <Slider min={-50} max={50} value={[doc.video.x]}
                    onValueChange={([v]) => setDoc((d) => ({ ...d, video: { ...d.video, x: v } }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Posição Y: {doc.video.y}%</Label>
                  <Slider min={-50} max={50} value={[doc.video.y]}
                    onValueChange={([v]) => setDoc((d) => ({ ...d, video: { ...d.video, y: v } }))} />
                </div>
                <Button variant="outline" size="sm" className="w-full"
                  onClick={() => setDoc((d) => ({ ...d, video: { zoom: 1, x: 0, y: 0 } }))}>
                  <ZoomOut size={12} className="mr-1" /> Resetar enquadramento
                </Button>
              </TabsContent>

              <TabsContent value="template" className="mt-3 space-y-3">
                {templateSrc ? (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Opacidade: {Math.round(doc.template.opacity * 100)}%</Label>
                      <Slider min={0} max={1} step={0.01} value={[doc.template.opacity]}
                        onValueChange={([v]) => setDoc((d) => ({ ...d, template: { ...d.template, opacity: v } }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Modo de mesclagem</Label>
                      <Select value={doc.template.blend}
                        onValueChange={(v: BlendMode) => setDoc((d) => ({ ...d, template: { ...d.template, blend: v } }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BLEND_MODES.map((m) => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        Use "Screen" ou "Multiply" se o template tiver fundo preto ou branco em vez de alpha.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Ajuste ao canvas</Label>
                      <Select value={doc.template.fit}
                        onValueChange={(v: "contain" | "cover") => setDoc((d) => ({ ...d, template: { ...d.template, fit: v } }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contain">Contain (mantém proporção)</SelectItem>
                          <SelectItem value="cover">Cover (preenche cortando)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button variant="outline" size="sm" className="w-full"
                      onClick={() => setDoc((d) => ({ ...d, template: { opacity: 1, blend: "normal", fit: "contain" } }))}>
                      Resetar overlay
                    </Button>
                  </>
                ) : (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    Nenhum template aplicado.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="assets" className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">URL do logo</Label>
                  <Input value={doc.logo_url ?? ""} placeholder="https://..."
                    onChange={(e) => setDoc((d) => ({ ...d, logo_url: e.target.value }))} />
                </div>
                {doc.logo_url && (
                  <img src={doc.logo_url} alt="logo"
                    className="max-h-24 rounded border border-border/40 bg-black/40 p-2" />
                )}
                <p className="text-xs text-muted-foreground">
                  O logo será aplicado no vídeo final durante a renderização.
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Timeline placeholder */}
      <Card className="glass border-border/50">
        <CardContent className="flex items-center gap-3 py-2">
          <span className="text-xs text-muted-foreground">Timeline</span>
          <div className="flex-1 rounded bg-black/40 p-2">
            <div className="flex h-8 items-center gap-1">
              <div className="h-full flex-1 rounded bg-gold/30" title="Cena 1 · Vídeo base" />
              {doc.texts.map((t) => (
                <div key={t.id} className="h-full w-16 rounded bg-primary/40"
                  title={`Texto: ${t.text}`} />
              ))}
            </div>
          </div>
          <span className="text-xs text-muted-foreground">
            {video?.duration_seconds ? `${Math.round(video.duration_seconds)}s` : "—"}
          </span>
        </CardContent>
      </Card>

      {/* Biblioteca de textos e CTAs prontos */}
      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquareText size={18} className="text-gold" />
              Textos e CTAs
            </DialogTitle>
            <DialogDescription>
              Adicione frases prontas de engajamento ao seu vídeo. Cada texto vira uma camada editável.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-[200px_1fr]">
            <div className="flex flex-row gap-1 overflow-x-auto md:flex-col md:overflow-visible">
              {TEXT_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setLibraryCategory(c.value)}
                  className={cn(
                    "whitespace-nowrap rounded border px-3 py-2 text-left text-xs transition md:whitespace-normal",
                    libraryCategory === c.value
                      ? "border-gold/60 bg-gold/10 text-gold"
                      : "border-border/40 bg-black/30 hover:border-gold/30",
                  )}
                >
                  <div className="font-medium">{c.label}</div>
                  <div className="mt-0.5 hidden text-[10px] text-muted-foreground md:block">{c.hint}</div>
                </button>
              ))}
            </div>

            <ScrollArea className="h-[420px] rounded border border-border/40 bg-black/20 p-2">
              <div className="grid gap-2">
                {TEXT_PRESETS[libraryCategory].map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-md border border-border/40 bg-black/40 p-2"
                  >
                    <div
                      className="flex-1 truncate text-sm"
                      style={{ fontWeight: p.weight ?? 700 }}
                      title={p.text}
                    >
                      {p.text}
                    </div>
                    <Button
                      size="sm"
                      className="h-8 bg-gold-gradient text-black"
                      onClick={() => { addPreset(p); setLibraryOpen(false); }}
                    >
                      <Plus size={12} className="mr-1" /> Adicionar
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 border-dashed"
                  onClick={() => toast.info("Geração por IA em breve — estrutura já preparada.")}
                >
                  <Sparkles size={12} className="mr-1.5" />
                  Gerar mais frases com IA
                </Button>
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Progresso de exportação — não bloqueia interação */}
      {exporting && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[60] w-[320px] max-w-[calc(100vw-2rem)]">
          <div className="pointer-events-auto rounded-xl border border-gold/40 bg-black/85 p-4 shadow-2xl backdrop-blur-md">
            <div className="mb-2 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-gold" />
              <div className="text-xs font-semibold text-gold">
                {exportProgress ?? "Exportando…"}
              </div>
              <div className="ml-auto text-[11px] font-mono text-white/70">{exportPercent}%</div>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gold-gradient transition-all duration-200"
                style={{ width: `${exportPercent}%` }}
              />
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1 text-[9px] uppercase tracking-wider">
              {(["prep", "template", "render", "upload"] as ExportPhase[]).map((ph, i) => {
                const phaseOrder: ExportPhase[] = ["prep", "template", "render", "encode", "upload"];
                const currentIdx = phaseOrder.indexOf(exportPhase);
                const thisIdx = phaseOrder.indexOf(ph);
                const done = currentIdx > thisIdx || exportPercent === 100;
                const active = currentIdx === thisIdx;
                return (
                  <div
                    key={ph}
                    className={cn(
                      "rounded px-1 py-0.5 text-center",
                      done && "bg-gold/20 text-gold",
                      active && "bg-gold/30 text-gold animate-pulse",
                      !done && !active && "bg-white/5 text-white/40",
                    )}
                  >
                    {["Vídeo", "Template", "Render", "Salvar"][i]}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] text-white/50">
              Você pode continuar navegando. Não feche esta aba.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
