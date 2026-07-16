import { useEffect, useRef } from "react";
import { TemplateElement } from "@/lib/templateTypes";
import { cn } from "@/lib/utils";

type Props = {
  el: TemplateElement;
  scale: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<TemplateElement>) => void;
};

type Drag =
  | { mode: "move"; startX: number; startY: number; ox: number; oy: number }
  | {
      mode: "resize";
      startX: number;
      startY: number;
      ox: number;
      oy: number;
      ow: number;
      oh: number;
      handle: "br" | "bl" | "tr" | "tl";
    }
  | { mode: "rotate"; cx: number; cy: number; startAngle: number; startRotation: number };

export default function CanvasElement({ el, scale, selected, onSelect, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.mode === "move") {
        const dx = (e.clientX - d.startX) / scale;
        const dy = (e.clientY - d.startY) / scale;
        onChange({ x: d.ox + dx, y: d.oy + dy });
      } else if (d.mode === "resize") {
        const dx = (e.clientX - d.startX) / scale;
        const dy = (e.clientY - d.startY) / scale;
        let x = d.ox, y = d.oy, w = d.ow, h = d.oh;
        if (d.handle === "br") { w = Math.max(20, d.ow + dx); h = Math.max(20, d.oh + dy); }
        if (d.handle === "bl") { x = d.ox + dx; w = Math.max(20, d.ow - dx); h = Math.max(20, d.oh + dy); }
        if (d.handle === "tr") { y = d.oy + dy; w = Math.max(20, d.ow + dx); h = Math.max(20, d.oh - dy); }
        if (d.handle === "tl") { x = d.ox + dx; y = d.oy + dy; w = Math.max(20, d.ow - dx); h = Math.max(20, d.oh - dy); }
        onChange({ x, y, w, h });
      } else if (d.mode === "rotate") {
        const ang = Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * 180 / Math.PI;
        onChange({ rotation: d.startRotation + (ang - d.startAngle) });
      }
    };
    const onUp = () => (dragRef.current = null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [scale, onChange]);

  if (el.hidden) return null;

  const startMove = (e: React.MouseEvent) => {
    if (el.locked) return;
    e.stopPropagation();
    onSelect();
    dragRef.current = { mode: "move", startX: e.clientX, startY: e.clientY, ox: el.x, oy: el.y };
  };

  const startResize = (handle: "br" | "bl" | "tr" | "tl") => (e: React.MouseEvent) => {
    e.stopPropagation();
    dragRef.current = {
      mode: "resize", startX: e.clientX, startY: e.clientY,
      ox: el.x, oy: el.y, ow: el.w, oh: el.h, handle,
    };
  };

  const startRotate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = ref.current!.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    dragRef.current = {
      mode: "rotate", cx, cy,
      startAngle: Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI,
      startRotation: el.rotation,
    };
  };

  const inner = () => {
    switch (el.type) {
      case "text":
      case "caption": {
        const isCaption = el.type === "caption";
        return (
          <div
            className="flex h-full w-full items-center justify-center px-2"
            style={{
              color: el.color ?? "#fff",
              fontFamily: el.fontFamily ?? "Inter",
              fontSize: (el.fontSize ?? 48) * scale,
              fontWeight: el.fontWeight ?? 700,
              textAlign: el.align ?? "center",
              letterSpacing: (el.letterSpacing ?? 0) * scale,
              textShadow: el.shadow ? `0 ${4 * scale}px ${12 * scale}px rgba(0,0,0,0.7)` : undefined,
              background: isCaption ? "rgba(0,0,0,0.55)" : undefined,
              borderRadius: isCaption ? 8 * scale : undefined,
              lineHeight: 1.1,
              overflow: "hidden",
              userSelect: "none",
            }}
          >
            {el.text || (isCaption ? "Legenda automática" : "Texto")}
          </div>
        );
      }
      case "image":
      case "logo":
        return el.src ? (
          <img src={el.src} alt="" className="h-full w-full object-contain pointer-events-none"
            style={{ opacity: el.opacity ?? 1 }} draggable={false} />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-white/5 text-[10px] text-white/60">
            {el.type === "logo" ? "LOGO" : "IMG"}
          </div>
        );
      case "video":
        return (
          <div className="flex h-full w-full items-center justify-center bg-black text-[10px] uppercase tracking-widest text-white/50 border border-white/10">
            Vídeo (fundo)
          </div>
        );
      case "shape":
        return (
          <div
            className="h-full w-full"
            style={{
              background: el.fill ?? "#D4AF37",
              borderRadius: el.shape === "circle" ? "50%" : (el.radius ?? 0) * scale,
              opacity: el.opacity ?? 1,
            }}
          />
        );
    }
  };

  return (
    <div
      ref={ref}
      onMouseDown={startMove}
      className={cn("absolute cursor-move", selected && "outline outline-2 outline-[hsl(var(--gold))]")}
      style={{
        left: el.x * scale,
        top: el.y * scale,
        width: el.w * scale,
        height: el.h * scale,
        transform: `rotate(${el.rotation}deg)`,
        zIndex: el.zIndex,
      }}
    >
      {inner()}
      {selected && !el.locked && (
        <>
          {(["tl", "tr", "bl", "br"] as const).map((h) => (
            <div
              key={h}
              onMouseDown={startResize(h)}
              className="absolute h-3 w-3 rounded-sm border border-black bg-[hsl(var(--gold))]"
              style={{
                left: h.includes("l") ? -6 : undefined,
                right: h.includes("r") ? -6 : undefined,
                top: h.startsWith("t") ? -6 : undefined,
                bottom: h.startsWith("b") ? -6 : undefined,
                cursor: h === "tl" || h === "br" ? "nwse-resize" : "nesw-resize",
              }}
            />
          ))}
          <div
            onMouseDown={startRotate}
            className="absolute left-1/2 h-3 w-3 -translate-x-1/2 cursor-grab rounded-full border border-black bg-[hsl(var(--gold))]"
            style={{ top: -22 }}
          />
        </>
      )}
    </div>
  );
}
