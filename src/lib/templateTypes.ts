export type ElementType = "text" | "image" | "logo" | "video" | "shape" | "caption";

export type TemplateElement = {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  zIndex: number;
  locked?: boolean;
  hidden?: boolean;
  opacity?: number;
  // text / caption
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  align?: "left" | "center" | "right";
  letterSpacing?: number;
  shadow?: boolean;
  animation?: "none" | "fade" | "slide" | "pop";
  // image / logo / video
  src?: string;
  // shape
  shape?: "rect" | "circle";
  fill?: string;
  radius?: number;
  // caption
  captionStyle?: "tiktok" | "viral" | "podcast" | "premium";
  captionPosition?: "top" | "center" | "bottom";
  highlightColor?: string;
};

export type TemplateCanvas = {
  width: number;
  height: number;
  background: string;
};

export type TemplateDoc = {
  canvas: TemplateCanvas;
  elements: TemplateElement[];
};

export const DEFAULT_CANVAS: TemplateCanvas = {
  width: 1080,
  height: 1920,
  background: "#050505",
};

export const emptyDoc = (): TemplateDoc => ({
  canvas: { ...DEFAULT_CANVAS },
  elements: [],
});

export const uid = () => Math.random().toString(36).slice(2, 10);
