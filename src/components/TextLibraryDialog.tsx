import { useMemo, useState } from "react";
import { ChevronRight, MessageSquareText, Plus, Search, Sparkles } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  TEXT_CATEGORIES, TEXT_PRESETS,
  type TextPreset, type TextPresetCategory,
} from "@/lib/text-library";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (p: TextPreset) => void;
  closeOnSelect?: boolean;
};

type Group = { id: string; label: string; icon: string; categories: TextPresetCategory[] };

const CURIO_CATS: TextPresetCategory[] = [
  "curio_favorites", "curio_friends", "curio_comment", "curio_challenge", "curio_viral",
];
const REAL_CATS: TextPresetCategory[] = [
  "real_favorites", "real_friends", "real_comment", "real_curiosity", "real_viral",
];

const GROUPS: Group[] = [
  {
    id: "general",
    label: "Geral",
    icon: "✨",
    categories: TEXT_CATEGORIES
      .map((c) => c.value)
      .filter(
        (v) =>
          !v.startsWith("memes_") &&
          !v.startsWith("movies_") &&
          !CURIO_CATS.includes(v) &&
          !REAL_CATS.includes(v),
      ) as TextPresetCategory[],
  },
  { id: "curiosidades", label: "Curiosidades", icon: "🧠", categories: CURIO_CATS },
  { id: "historias", label: "Histórias Reais", icon: "📖", categories: REAL_CATS },
  {
    id: "memes",
    label: "Memes",
    icon: "😂",
    categories: TEXT_CATEGORIES.map((c) => c.value).filter((v) => v.startsWith("memes_")) as TextPresetCategory[],
  },
  {
    id: "movies",
    label: "Filmes e Séries",
    icon: "🎬",
    categories: TEXT_CATEGORIES.map((c) => c.value).filter((v) => v.startsWith("movies_")) as TextPresetCategory[],
  },
];

const CAT_LABEL: Record<string, string> = Object.fromEntries(
  TEXT_CATEGORIES.map((c) => [c.value, c.label.replace(/^.*•\s*/, "")]),
);

type Row =
  | { kind: "group"; groupId: string; label: string; icon: string; count: number; open: boolean }
  | { kind: "category"; groupId: string; category: TextPresetCategory; label: string; count: number; open: boolean }
  | { kind: "item"; preset: TextPreset }
  | { kind: "search-cat"; label: string; count: number }
  | { kind: "empty" };

export default function TextLibraryDialog({ open, onOpenChange, onSelect, closeOnSelect = false }: Props) {
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ general: true, memes: false, movies: false });
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});

  const q = query.trim().toLowerCase();

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    if (q) {
      let any = false;
      for (const g of GROUPS) {
        for (const cat of g.categories) {
          const items = TEXT_PRESETS[cat].filter((p) => p.text.toLowerCase().includes(q));
          if (!items.length) continue;
          any = true;
          out.push({ kind: "search-cat", label: `${g.icon} ${g.label} — ${CAT_LABEL[cat] ?? cat}`, count: items.length });
          for (const p of items) out.push({ kind: "item", preset: p });
        }
      }
      if (!any) out.push({ kind: "empty" });
      return out;
    }
    for (const g of GROUPS) {
      const totalCount = g.categories.reduce((n, c) => n + TEXT_PRESETS[c].length, 0);
      const gOpen = !!openGroups[g.id];
      out.push({ kind: "group", groupId: g.id, label: g.label, icon: g.icon, count: totalCount, open: gOpen });
      if (!gOpen) continue;
      for (const cat of g.categories) {
        const items = TEXT_PRESETS[cat];
        const key = `${g.id}:${cat}`;
        const cOpen = openCats[key] ?? g.categories.length === 1;
        out.push({ kind: "category", groupId: g.id, category: cat, label: CAT_LABEL[cat] ?? cat, count: items.length, open: cOpen });
        if (!cOpen) continue;
        for (const p of items) out.push({ kind: "item", preset: p });
      }
    }
    return out;
  }, [q, openGroups, openCats]);




  const handleClick = (p: TextPreset) => {
    onSelect(p);
    if (closeOnSelect) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-h-[85vh] w-[95vw] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/50 px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareText size={18} className="text-gold" />
            Textos e CTAs
          </DialogTitle>
          <DialogDescription className="text-xs">
            Toque em uma frase para adicionar como camada editável no seu vídeo.
          </DialogDescription>
          <div className="relative mt-3">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar CTAs, frases, emojis…"
              className="h-9 pl-9"
            />
          </div>
        </DialogHeader>

        <div className="lib-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {rows.map((r, idx) => {
            if (r.kind === "group") {
              return (
                <button
                  key={`g-${r.groupId}`}
                  onClick={() => setOpenGroups((s) => ({ ...s, [r.groupId]: !s[r.groupId] }))}
                  className="flex h-11 w-full items-center gap-2 rounded-md border border-border/40 bg-secondary/40 px-3 text-left text-sm font-semibold hover:border-gold/40 hover:bg-secondary/70"
                >
                  <ChevronRight
                    size={14}
                    className={cn("transition-transform text-muted-foreground", r.open && "rotate-90 text-gold")}
                  />
                  <span className="text-base">{r.icon}</span>
                  <span className="flex-1">{r.label}</span>
                  <span className="text-[10px] font-normal text-muted-foreground">{r.count}</span>
                </button>
              );
            }
            if (r.kind === "category") {
              const key = `${r.groupId}:${r.category}`;
              return (
                <button
                  key={`c-${key}`}
                  onClick={() => setOpenCats((s) => ({ ...s, [key]: !(s[key] ?? false) }))}
                  className="ml-4 flex h-8 w-[calc(100%-1rem)] items-center gap-2 rounded border-l-2 border-border/30 pl-3 pr-2 text-left text-xs text-muted-foreground hover:border-gold/50 hover:text-foreground"
                >
                  <ChevronRight
                    size={12}
                    className={cn("transition-transform", r.open && "rotate-90 text-gold")}
                  />
                  <span className="flex-1 uppercase tracking-wider">{r.label}</span>
                  <span className="text-[10px]">{r.count}</span>
                </button>
              );
            }
            if (r.kind === "search-cat") {
              return (
                <div key={`sc-${idx}`} className="flex h-8 items-center px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {r.label} <span className="ml-2 opacity-60">({r.count})</span>
                </div>
              );
            }
            if (r.kind === "empty") {
              return (
                <div key="empty" className="flex h-32 flex-col items-center justify-center rounded-md border border-dashed border-border/40 text-xs text-muted-foreground">
                  Nenhuma frase encontrada para “{query}”.
                </div>
              );
            }
            const p = r.preset;
            return (
              <button
                key={`p-${p.id}-${idx}`}
                onClick={() => handleClick(p)}
                className="group ml-8 flex h-10 w-[calc(100%-2rem)] items-center gap-2 rounded-md border border-border/40 bg-card/60 px-3 text-left text-xs transition hover:border-gold/60 hover:bg-gold/5"
                title="Adicionar ao vídeo"
              >
                <span className="flex-1 truncate" style={{ fontWeight: p.weight ?? 600 }}>
                  {p.text}
                </span>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold opacity-0 transition group-hover:opacity-100">
                  <Plus size={12} />
                </span>
              </button>
            );
          })}
        </div>


        <div className="shrink-0 border-t border-border/50 bg-background/60 px-4 py-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full border-dashed text-xs"
            onClick={() => toast.info("Geração por IA em breve — estrutura já preparada.")}
          >
            <Sparkles size={12} className="mr-1.5" />
            Gerar mais frases com IA
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
