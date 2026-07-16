import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Type, Image as ImageIcon, Sparkles, Video, Square, Captions,
  Save, ArrowLeft, Copy, Trash2, Eye, EyeOff, Lock, Unlock,
  ChevronUp, ChevronDown, ChevronsUp, ChevronsDown, RotateCcw, Layers, Wand2, Loader2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import CanvasElement from "@/components/editor/CanvasElement";
import {
  DEFAULT_CANVAS, ElementType, TemplateDoc, TemplateElement,
  emptyDoc, uid,
} from "@/lib/templateTypes";

const FONTS = ["Inter", "Montserrat", "Poppins", "Bebas Neue", "Anton", "Oswald", "Playfair Display", "Roboto"];

const CAPTION_PRESETS: Record<string, Partial<TemplateElement>> = {
  tiktok: { color: "#FFFFFF", highlightColor: "#00F5D4", fontFamily: "Inter", fontWeight: 900, fontSize: 64, shadow: true },
  viral: { color: "#FFE066", highlightColor: "#FF3366", fontFamily: "Anton", fontWeight: 900, fontSize: 80, shadow: true },
  podcast: { color: "#FFFFFF", highlightColor: "#D4AF37", fontFamily: "Playfair Display", fontWeight: 700, fontSize: 52, shadow: false },
  premium: { color: "#D4AF37", highlightColor: "#FFFFFF", fontFamily: "Montserrat", fontWeight: 800, fontSize: 60, shadow: true },
};

const CANVAS_DISPLAY_HEIGHT = 720;

export default function TemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === "new";

  const [name, setName] = useState("Novo Template");
  const [description, setDescription] = useState("");
  const [doc, setDoc] = useState<TemplateDoc>(emptyDoc());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTypeRef = useRef<"image" | "logo">("image");

  useEffect(() => {
    if (isNew) return;
    (async () => {
      const { data, error } = await supabase.from("templates").select("*").eq("id", id).maybeSingle();
      if (error || !data) {
        toast.error("Template não encontrado");
        navigate("/templates");
        return;
      }
      setName(data.name);
      setDescription(data.description ?? "");
      const s = data.settings as any;
      if (s && s.elements && s.canvas) setDoc(s as TemplateDoc);
    })();
  }, [id, isNew, navigate]);

  const scale = CANVAS_DISPLAY_HEIGHT / doc.canvas.height;
  const displayW = doc.canvas.width * scale;
  const displayH = doc.canvas.height * scale;

  const selected = useMemo(
    () => doc.elements.find((e) => e.id === selectedId) ?? null,
    [doc.elements, selectedId]
  );

  const patchDoc = (fn: (d: TemplateDoc) => TemplateDoc) => setDoc((d) => fn(d));

  const updateEl = useCallback((elId: string, patch: Partial<TemplateElement>) => {
    setDoc((d) => ({
      ...d,
      elements: d.elements.map((e) => (e.id === elId ? { ...e, ...patch } : e)),
    }));
  }, []);

  const nextZ = () => (doc.elements.reduce((m, e) => Math.max(m, e.zIndex), 0) + 1);

  const addElement = (type: ElementType) => {
    const base: TemplateElement = {
      id: uid(),
      type,
      x: doc.canvas.width / 2 - 200,
      y: doc.canvas.height / 2 - 100,
      w: 400,
      h: 200,
      rotation: 0,
      zIndex: nextZ(),
      opacity: 1,
    };
    let el: TemplateElement = base;
    if (type === "text") {
      el = { ...base, text: "Seu texto aqui", fontFamily: "Inter", fontSize: 64, fontWeight: 800, color: "#FFFFFF", align: "center", shadow: true, animation: "none" };
    } else if (type === "caption") {
      el = { ...base, text: "Legenda automática", ...CAPTION_PRESETS.tiktok, captionStyle: "tiktok", captionPosition: "bottom", align: "center", y: doc.canvas.height - 500, w: doc.canvas.width - 120, x: 60, h: 300, animation: "pop" };
    } else if (type === "shape") {
      el = { ...base, shape: "rect", fill: "#D4AF37", radius: 24, w: 300, h: 300 };
    } else if (type === "video") {
      el = { ...base, x: 0, y: 0, w: doc.canvas.width, h: doc.canvas.height, zIndex: 0 };
    } else if (type === "logo") {
      el = { ...base, w: 240, h: 240, x: doc.canvas.width - 300, y: 60 };
    }
    patchDoc((d) => ({ ...d, elements: [...d.elements, el] }));
    setSelectedId(el.id);
  };

  const triggerUpload = (kind: "image" | "logo") => {
    uploadTypeRef.current = kind;
    fileInputRef.current?.click();
  };

  const onUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = "";
    const path = `template-assets/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage.from("media").upload(path, f, { upsert: false });
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("media").createSignedUrl
      ? await supabase.storage.from("media").createSignedUrl(path, 60 * 60 * 24 * 365)
      : { data: null } as any;
    const url = data?.signedUrl;
    if (!url) return toast.error("Falha ao gerar URL");
    const kind = uploadTypeRef.current;
    const el: TemplateElement = {
      id: uid(), type: kind, src: url, x: 100, y: 100, w: 400, h: 400,
      rotation: 0, zIndex: nextZ(), opacity: 1,
    };
    patchDoc((d) => ({ ...d, elements: [...d.elements, el] }));
    setSelectedId(el.id);
    toast.success("Imagem adicionada");
  };

  const duplicateEl = (elId: string) => {
    const src = doc.elements.find((e) => e.id === elId);
    if (!src) return;
    const copy: TemplateElement = { ...src, id: uid(), x: src.x + 40, y: src.y + 40, zIndex: nextZ() };
    patchDoc((d) => ({ ...d, elements: [...d.elements, copy] }));
    setSelectedId(copy.id);
  };

  const deleteEl = (elId: string) => {
    patchDoc((d) => ({ ...d, elements: d.elements.filter((e) => e.id !== elId) }));
    setSelectedId(null);
  };

  const moveLayer = (elId: string, dir: "front" | "back" | "up" | "down") => {
    setDoc((d) => {
      const els = [...d.elements].sort((a, b) => a.zIndex - b.zIndex);
      const idx = els.findIndex((e) => e.id === elId);
      if (idx < 0) return d;
      if (dir === "front") els[idx].zIndex = (els[els.length - 1]?.zIndex ?? 0) + 1;
      else if (dir === "back") els[idx].zIndex = (els[0]?.zIndex ?? 0) - 1;
      else if (dir === "up" && idx < els.length - 1) {
        const a = els[idx].zIndex, b = els[idx + 1].zIndex;
        els[idx].zIndex = b; els[idx + 1].zIndex = a;
      } else if (dir === "down" && idx > 0) {
        const a = els[idx].zIndex, b = els[idx - 1].zIndex;
        els[idx].zIndex = b; els[idx - 1].zIndex = a;
      }
      return { ...d, elements: [...els] };
    });
  };

  const save = async () => {
    setSaving(true);
    const payload = {
      name,
      description,
      settings: doc as any,
      is_builtin: false,
    };
    if (isNew) {
      const { data, error } = await supabase.from("templates").insert(payload).select("id").single();
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Template criado");
      navigate(`/templates/editor/${data.id}`, { replace: true });
    } else {
      const { error } = await supabase.from("templates").update(payload).eq("id", id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Template salvo");
    }
  };

  const sortedLayers = [...doc.elements].sort((a, b) => b.zIndex - a.zIndex);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectedId) return;
      if ((e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA/)) return;
      if (e.key === "Delete" || e.key === "Backspace") deleteEl(selectedId);
      if ((e.metaKey || e.ctrlKey) && e.key === "d") { e.preventDefault(); duplicateEl(selectedId); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  return (
    <div className="-mx-4 -my-8 md:-mx-8 md:-my-10 flex h-[calc(100vh-4rem)] flex-col bg-background text-foreground">
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onUploadFile} />

      {/* Top bar */}
      <div className="flex h-14 items-center gap-3 border-b border-border/60 bg-card/60 px-4 backdrop-blur">
        <Button variant="ghost" size="sm" onClick={() => navigate("/templates")}>
          <ArrowLeft size={16} className="mr-1" /> Templates
        </Button>
        <div className="h-6 w-px bg-border/60" />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 max-w-[280px] border-none bg-transparent text-sm font-medium focus-visible:ring-1"
        />
        <Badge variant="outline" className="border-gold/30 text-[10px] text-gold">1080×1920</Badge>
        <div className="ml-auto flex items-center gap-2">
          <Button
            onClick={save}
            disabled={saving}
            size="sm"
            className="bg-gold-gradient text-black glow-gold"
          >
            <Save size={14} className="mr-1" /> {saving ? "Salvando..." : "Salvar Template"}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <aside className="w-56 shrink-0 border-r border-border/60 bg-card/40 p-3 overflow-y-auto">
          <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Elementos</p>
          <div className="space-y-1">
            {[
              { t: "text" as const, icon: Type, label: "Adicionar texto" },
              { t: "image" as const, icon: ImageIcon, label: "Adicionar imagem", upload: "image" as const },
              { t: "logo" as const, icon: Sparkles, label: "Adicionar logo", upload: "logo" as const },
              { t: "video" as const, icon: Video, label: "Vídeo (fundo)" },
              { t: "shape" as const, icon: Square, label: "Forma" },
              { t: "caption" as const, icon: Captions, label: "Legenda automática" },
            ].map((b) => (
              <button
                key={b.t}
                onClick={() => (b.upload ? triggerUpload(b.upload) : addElement(b.t))}
                className="flex w-full items-center gap-2 rounded-md border border-border/50 bg-background/50 px-3 py-2 text-left text-xs hover:border-gold/40 hover:bg-gold/5"
              >
                <b.icon size={14} className="text-gold" />
                {b.label}
              </button>
            ))}
          </div>

          <p className="mt-5 mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Canvas</p>
          <div className="space-y-2 rounded-md border border-border/50 p-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Fundo</span>
              <input
                type="color"
                value={doc.canvas.background}
                onChange={(e) =>
                  patchDoc((d) => ({ ...d, canvas: { ...d.canvas, background: e.target.value } }))
                }
                className="h-6 w-10 rounded border border-border/50 bg-transparent"
              />
            </div>
            <Button
              variant="ghost" size="sm" className="w-full justify-start text-xs"
              onClick={() => setDoc({ canvas: { ...DEFAULT_CANVAS }, elements: [] })}
            >
              <RotateCcw size={12} className="mr-1" /> Limpar tudo
            </Button>
          </div>
        </aside>

        {/* Canvas */}
        <main className="flex flex-1 items-center justify-center overflow-auto bg-[radial-gradient(circle_at_center,hsl(0_0%_8%),hsl(0_0%_2%))] p-8"
          onClick={() => setSelectedId(null)}>
          <div
            className="relative shadow-[0_30px_120px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/5"
            style={{
              width: displayW,
              height: displayH,
              background: doc.canvas.background,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {doc.elements
              .slice()
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((el) => (
                <CanvasElement
                  key={el.id}
                  el={el}
                  scale={scale}
                  selected={el.id === selectedId}
                  onSelect={() => setSelectedId(el.id)}
                  onChange={(patch) => updateEl(el.id, patch)}
                />
              ))}
          </div>
        </main>

        {/* Right panel */}
        <aside className="w-72 shrink-0 border-l border-border/60 bg-card/40 overflow-y-auto">
          <div className="p-3">
            <p className="mb-2 flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
              <Layers size={11} /> Camadas
            </p>
            <div className="space-y-1">
              {sortedLayers.length === 0 && (
                <p className="rounded-md border border-dashed border-border/50 p-3 text-center text-[11px] text-muted-foreground">
                  Nenhum elemento
                </p>
              )}
              {sortedLayers.map((el) => (
                <div
                  key={el.id}
                  onClick={() => setSelectedId(el.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] cursor-pointer",
                    selectedId === el.id ? "border-gold/50 bg-gold/10" : "border-border/50 hover:border-gold/30"
                  )}
                >
                  <span className="flex-1 truncate capitalize">
                    {el.type}{el.type === "text" && el.text ? `: ${el.text.slice(0, 14)}` : ""}
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); updateEl(el.id, { hidden: !el.hidden }); }}
                    className="text-muted-foreground hover:text-foreground">
                    {el.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); updateEl(el.id, { locked: !el.locked }); }}
                    className="text-muted-foreground hover:text-foreground">
                    {el.locked ? <Lock size={12} /> : <Unlock size={12} />}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border/60 p-3">
            <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Propriedades</p>
            {!selected ? (
              <p className="text-[11px] text-muted-foreground">Selecione um elemento</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" className="h-7 flex-1" onClick={() => duplicateEl(selected.id)}>
                    <Copy size={12} className="mr-1" /> Duplicar
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 flex-1" onClick={() => deleteEl(selected.id)}>
                    <Trash2 size={12} className="mr-1" /> Excluir
                  </Button>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => moveLayer(selected.id, "front")} title="Frente"><ChevronsUp size={12} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => moveLayer(selected.id, "up")} title="+1"><ChevronUp size={12} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => moveLayer(selected.id, "down")} title="-1"><ChevronDown size={12} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => moveLayer(selected.id, "back")} title="Fundo"><ChevronsDown size={12} /></Button>
                </div>

                <PropRow label="Posição">
                  <div className="grid grid-cols-2 gap-1">
                    <NumInput value={selected.x} onChange={(v) => updateEl(selected.id, { x: v })} suffix="X" />
                    <NumInput value={selected.y} onChange={(v) => updateEl(selected.id, { y: v })} suffix="Y" />
                  </div>
                </PropRow>
                <PropRow label="Tamanho">
                  <div className="grid grid-cols-2 gap-1">
                    <NumInput value={selected.w} onChange={(v) => updateEl(selected.id, { w: v })} suffix="W" />
                    <NumInput value={selected.h} onChange={(v) => updateEl(selected.id, { h: v })} suffix="H" />
                  </div>
                </PropRow>
                <PropRow label={`Rotação: ${Math.round(selected.rotation)}°`}>
                  <Slider value={[selected.rotation]} min={-180} max={180} step={1}
                    onValueChange={([v]) => updateEl(selected.id, { rotation: v })} />
                </PropRow>
                <PropRow label={`Opacidade: ${Math.round((selected.opacity ?? 1) * 100)}%`}>
                  <Slider value={[(selected.opacity ?? 1) * 100]} min={0} max={100} step={1}
                    onValueChange={([v]) => updateEl(selected.id, { opacity: v / 100 })} />
                </PropRow>

                {(selected.type === "text" || selected.type === "caption") && (
                  <>
                    <PropRow label="Texto">
                      <Textarea value={selected.text ?? ""} rows={2}
                        onChange={(e) => updateEl(selected.id, { text: e.target.value })}
                        className="text-xs" />
                    </PropRow>
                    <PropRow label="Fonte">
                      <Select value={selected.fontFamily ?? "Inter"} onValueChange={(v) => updateEl(selected.id, { fontFamily: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{FONTS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                      </Select>
                    </PropRow>
                    <PropRow label={`Tamanho: ${selected.fontSize ?? 48}px`}>
                      <Slider value={[selected.fontSize ?? 48]} min={12} max={200} step={1}
                        onValueChange={([v]) => updateEl(selected.id, { fontSize: v })} />
                    </PropRow>
                    <PropRow label={`Peso: ${selected.fontWeight ?? 700}`}>
                      <Slider value={[selected.fontWeight ?? 700]} min={100} max={900} step={100}
                        onValueChange={([v]) => updateEl(selected.id, { fontWeight: v })} />
                    </PropRow>
                    <PropRow label="Cor">
                      <input type="color" value={selected.color ?? "#ffffff"}
                        onChange={(e) => updateEl(selected.id, { color: e.target.value })}
                        className="h-8 w-full rounded border border-border/50 bg-transparent" />
                    </PropRow>
                    <PropRow label="Alinhamento">
                      <Select value={selected.align ?? "center"} onValueChange={(v) => updateEl(selected.id, { align: v as any })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="left">Esquerda</SelectItem>
                          <SelectItem value="center">Centro</SelectItem>
                          <SelectItem value="right">Direita</SelectItem>
                        </SelectContent>
                      </Select>
                    </PropRow>
                    <PropRow label={`Espaçamento: ${selected.letterSpacing ?? 0}px`}>
                      <Slider value={[selected.letterSpacing ?? 0]} min={-5} max={30} step={1}
                        onValueChange={([v]) => updateEl(selected.id, { letterSpacing: v })} />
                    </PropRow>
                    <PropRow label="Sombra">
                      <Switch checked={!!selected.shadow} onCheckedChange={(v) => updateEl(selected.id, { shadow: v })} />
                    </PropRow>
                    <PropRow label="Animação">
                      <Select value={selected.animation ?? "none"} onValueChange={(v) => updateEl(selected.id, { animation: v as any })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhuma</SelectItem>
                          <SelectItem value="fade">Fade</SelectItem>
                          <SelectItem value="slide">Slide</SelectItem>
                          <SelectItem value="pop">Pop</SelectItem>
                        </SelectContent>
                      </Select>
                    </PropRow>
                  </>
                )}

                {selected.type === "caption" && (
                  <>
                    <PropRow label="Estilo de legenda">
                      <Select
                        value={selected.captionStyle ?? "tiktok"}
                        onValueChange={(v) => updateEl(selected.id, {
                          captionStyle: v as any, ...CAPTION_PRESETS[v],
                        })}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tiktok">TikTok</SelectItem>
                          <SelectItem value="viral">Viral</SelectItem>
                          <SelectItem value="podcast">Podcast</SelectItem>
                          <SelectItem value="premium">Premium</SelectItem>
                        </SelectContent>
                      </Select>
                    </PropRow>
                    <PropRow label="Posição">
                      <Select
                        value={selected.captionPosition ?? "bottom"}
                        onValueChange={(v) => {
                          const cw = doc.canvas.width - 120;
                          const ch = 300;
                          const x = 60;
                          const y = v === "top" ? 120 : v === "center" ? (doc.canvas.height - ch) / 2 : doc.canvas.height - ch - 200;
                          updateEl(selected.id, { captionPosition: v as any, x, y, w: cw, h: ch });
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="top">Topo</SelectItem>
                          <SelectItem value="center">Centro</SelectItem>
                          <SelectItem value="bottom">Inferior</SelectItem>
                        </SelectContent>
                      </Select>
                    </PropRow>
                    <PropRow label="Cor de destaque">
                      <input type="color" value={selected.highlightColor ?? "#D4AF37"}
                        onChange={(e) => updateEl(selected.id, { highlightColor: e.target.value })}
                        className="h-8 w-full rounded border border-border/50 bg-transparent" />
                    </PropRow>
                  </>
                )}

                {selected.type === "shape" && (
                  <>
                    <PropRow label="Formato">
                      <Select value={selected.shape ?? "rect"} onValueChange={(v) => updateEl(selected.id, { shape: v as any })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="rect">Retângulo</SelectItem>
                          <SelectItem value="circle">Círculo</SelectItem>
                        </SelectContent>
                      </Select>
                    </PropRow>
                    <PropRow label="Cor">
                      <input type="color" value={selected.fill ?? "#D4AF37"}
                        onChange={(e) => updateEl(selected.id, { fill: e.target.value })}
                        className="h-8 w-full rounded border border-border/50 bg-transparent" />
                    </PropRow>
                    {selected.shape !== "circle" && (
                      <PropRow label={`Cantos: ${selected.radius ?? 0}px`}>
                        <Slider value={[selected.radius ?? 0]} min={0} max={200} step={1}
                          onValueChange={([v]) => updateEl(selected.id, { radius: v })} />
                      </PropRow>
                    )}
                  </>
                )}

                {(selected.type === "image" || selected.type === "logo") && (
                  <PropRow label="Substituir">
                    <Button size="sm" variant="outline" className="h-8 w-full text-xs"
                      onClick={() => triggerUpload(selected.type as "image" | "logo")}>
                      Trocar imagem
                    </Button>
                  </PropRow>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, suffix }: { value: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="relative">
      <Input
        type="number"
        value={Math.round(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 pr-6 text-xs"
      />
      {suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{suffix}</span>}
    </div>
  );
}
