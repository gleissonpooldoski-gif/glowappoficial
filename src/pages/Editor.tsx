import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Save, Rocket, Type, Plus, Trash2, Loader2, Layers,
  Palette, Image as ImageIcon, ZoomIn, ZoomOut, Move,
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
import { cn } from "@/lib/utils";

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
};

type EditDoc = {
  video: { zoom: number; x: number; y: number };
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

const FONTS = ["Montserrat", "Inter", "Poppins", "Playfair Display", "Bebas Neue", "Roboto", "Oswald"];

const defaultDoc: EditDoc = {
  video: { zoom: 1, x: 0, y: 0 },
  texts: [],
  colors: { primary: "#D4AF37", secondary: "#FFFFFF" },
};

const safeDoc = (value: unknown): EditDoc => {
  const raw = (value ?? {}) as Partial<EditDoc>;
  return {
    ...defaultDoc,
    ...raw,
    video: { ...defaultDoc.video, ...(raw.video ?? {}) },
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
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; sx: number; sy: number; px: number; py: number } | null>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [templateUrl, setTemplateUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [videoReady, setVideoReady] = useState(false);

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
      setTemplate(null);

      let nextVideoUrl = data.video_url ?? v.original_url ?? null;
      if (v.original_path) {
        const { data: signed, error: signErr } = await supabase.storage
          .from("videos")
          .createSignedUrl(v.original_path, 60 * 60 * 6);
        if (signErr || !signed?.signedUrl) {
          console.error("[Editor] createSignedUrl failed", signErr, "path:", v.original_path);
          console.error("Erro ao buscar vídeo", signErr);
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
        console.error("Erro ao buscar vídeo", "URL vazia");
        setLoadError({
          title: "Erro ao carregar vídeo",
          reason: "URL do vídeo está vazia.",
          url: null,
        });
        setLoading(false);
        return;
      }

      console.log("URL do vídeo encontrada", nextVideoUrl);

      const { error: urlUpdateErr } = await (supabase as any).from("edits").update({
        video_url: nextVideoUrl,
        video_filename: v.filename,
        video_storage_path: v.original_path,
        user_id: data.user_id ?? "single-user",
        owner_user_id: data.owner_user_id ?? "single-user",
        status: "editing",
      }).eq("id", id);
      if (urlUpdateErr) console.error("[Editor] edit url update error", urlUpdateErr);

      setVideoUrl(nextVideoUrl);
      setTemplateUrl(null);
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
    };
    setDoc((d) => ({ ...d, texts: [...d.texts, t] }));
    setSelectedTextId(t.id);
  };

  const removeText = (tid: string) => {
    setDoc((d) => ({ ...d, texts: d.texts.filter((t) => t.id !== tid) }));
    if (selectedTextId === tid) setSelectedTextId(null);
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
    const d = dragRef.current;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const dx = ((e.clientX - d.sx) / rect.width) * 100;
    const dy = ((e.clientY - d.sy) / rect.height) * 100;
    updateText(d.id, {
      x: Math.max(0, Math.min(100, d.px + dx)),
      y: Math.max(0, Math.min(100, d.py + dy)),
    });
  };

  const onStagePointerUp = () => { dragRef.current = null; };

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

  const exportVideo = async () => {
    if (!id || !edit) return;
    setExporting(true);
    try {
      const ok = await save(true);
      if (!ok) return;
      const { data: q, error: qErr } = await supabase.from("processing_queue").insert({
        video_id: edit.video_id,
        template_id: edit.template_id,
        project_id: edit.project_id,
        status: "pending" as const,
        progress: 0,
        options: { edit_id: id, aspect_ratio: ratio, doc } as any,
      }).select("id").single();
      if (qErr) throw qErr;
      await (supabase as any).from("edits").update({
        status: "processing", queue_id: q.id,
      }).eq("id", id);
      // NOTE: não alteramos o status do vídeo original — a renderização
      // gera um novo arquivo em "Vídeos Prontos" apenas quando o pipeline
      // marca o vídeo como "finished".
      toast.success("Enviado para renderização");
      navigate("/processing");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao exportar");
    } finally {
      setExporting(false);
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
            Exportar / Gerar vídeo
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
        <div className="flex items-center justify-center rounded-lg border border-border/50 bg-black/60 p-4">
          <div
            ref={stageRef}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerUp}
            onPointerLeave={onStagePointerUp}
            onClick={() => setSelectedTextId(null)}
            className="relative overflow-hidden rounded-md bg-black shadow-2xl ring-1 ring-gold/20"
            style={{
              aspectRatio: `${r.w} / ${r.h}`,
              height: r.h >= r.w ? "min(70vh, 720px)" : undefined,
              width: r.w > r.h ? "min(80vw, 1000px)" : undefined,
            }}
          >
            {/* Layer 1 — Vídeo original (fundo, opacidade total, sem blend) */}
            {videoSrc ? (
              <>
                <video
                  src={videoSrc}
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{
                    zIndex: 1,
                    opacity: 1,
                    mixBlendMode: "normal",
                    transform: `translate(${doc.video.x}%, ${doc.video.y}%) scale(${doc.video.zoom})`,
                    transformOrigin: "center",
                  }}
                  autoPlay muted loop playsInline
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
            {/* Layer 2 — Template overlay (acima do vídeo, sem blend, opacidade total) */}
            {templateSrc && (template?.file_type ?? "").startsWith("image/") && (
              <img
                src={templateSrc}
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                style={{ zIndex: 2, mixBlendMode: "normal", opacity: 1 }}
              />
            )}
            {templateSrc && (template?.file_type ?? "").startsWith("video/") && (
              <video
                src={templateSrc}
                className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                style={{ zIndex: 2, mixBlendMode: "normal", opacity: 1 }}
                autoPlay muted loop playsInline
              />
            )}
            {doc.texts.map((t) => (
              <div
                key={t.id}
                onPointerDown={(e) => onStagePointerDown(e, t.id)}
                className={cn(
                  "absolute cursor-move select-none whitespace-pre px-2 py-1",
                  selectedTextId === t.id && "outline outline-2 outline-gold/80",
                  t.animation === "fade" && "animate-fade-in",
                  t.animation === "pulse" && "animate-pulse",
                  t.animation === "slide-up" && "animate-[slide-up_0.6s_ease-out]",
                )}
                style={{
                  zIndex: 3,
                  left: `${t.x}%`, top: `${t.y}%`,
                  transform: "translate(-50%, -50%)",
                  fontFamily: t.font, fontSize: t.size, color: t.color,
                  fontWeight: t.weight, textShadow: "0 2px 8px rgba(0,0,0,0.6)",
                }}
              >
                {t.text || "Texto"}
              </div>
            ))}
          </div>
        </div>

        {/* Right panel — properties */}
        <Card className="glass border-border/50 overflow-y-auto">
          <CardContent className="p-3">
            <Tabs defaultValue="text">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="text" className="text-xs"><Type size={12} className="mr-1" />Texto</TabsTrigger>
                <TabsTrigger value="video" className="text-xs"><Move size={12} className="mr-1" />Vídeo</TabsTrigger>
                <TabsTrigger value="assets" className="text-xs"><ImageIcon size={12} className="mr-1" />Logo</TabsTrigger>
              </TabsList>

              <TabsContent value="text" className="mt-3 space-y-3">
                {selectedText ? (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Conteúdo</Label>
                      <Input value={selectedText.text}
                        onChange={(e) => updateText(selectedText.id, { text: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Fonte</Label>
                      <Select value={selectedText.font}
                        onValueChange={(v) => updateText(selectedText.id, { font: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FONTS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                        </SelectContent>
                      </Select>
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
                    <div className="flex items-center gap-2">
                      <input type="color" value={selectedText.color}
                        onChange={(e) => updateText(selectedText.id, { color: e.target.value })}
                        className="h-8 w-10 cursor-pointer rounded border border-border/40 bg-transparent" />
                      <Label className="text-xs">Cor do texto</Label>
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
    </div>
  );
}
