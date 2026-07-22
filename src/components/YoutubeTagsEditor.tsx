// Editor de TAGS SEO do YouTube. Aceita 15-30 tags, 500 chars totais.
// Suporta adicionar via input (Enter/vírgula), remover clicando no ×,
// e regenerar via IA a partir da legenda/hashtags do post.
import { useState, KeyboardEvent } from "react";
import { Sparkles, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { buildYoutubeMetaFromCaption } from "@/lib/youtube-meta";

type Props = {
  value: string[];
  onChange: (tags: string[]) => void;
  caption?: string | null;
  hashtags?: string | null;
  videoId?: string | null;
  disabled?: boolean;
};

const MAX_TAGS = 30;
const MAX_TOTAL_CHARS = 500;

function totalLen(tags: string[]): number {
  let n = 0;
  for (let i = 0; i < tags.length; i++) {
    const t = tags[i];
    if (i > 0) n += 1;
    n += t.length + (t.includes(" ") ? 2 : 0);
  }
  return n;
}

export default function YoutubeTagsEditor({
  value, onChange, caption, hashtags, videoId, disabled,
}: Props) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const addTag = (raw: string) => {
    const parts = raw.split(",").map((p) => p.replace(/^#/, "").replace(/\s+/g, " ").trim()).filter(Boolean);
    if (!parts.length) return;
    const next = value.slice();
    const seen = new Set(next.map((t) => t.toLowerCase()));
    for (const p of parts) {
      if (p.length < 2 || p.length > 60) continue;
      if (seen.has(p.toLowerCase())) continue;
      if (next.length >= MAX_TAGS) break;
      if (totalLen([...next, p]) > MAX_TOTAL_CHARS) break;
      next.push(p);
      seen.add(p.toLowerCase());
    }
    onChange(next);
  };

  const removeTag = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(draft);
      setDraft("");
    } else if (e.key === "Backspace" && !draft && value.length) {
      removeTag(value.length - 1);
    }
  };

  const regenerate = async () => {
    setBusy(true);
    try {
      const meta = await buildYoutubeMetaFromCaption(caption ?? "", hashtags ?? "", { videoId: videoId ?? null });
      if (!meta.tags.length) {
        toast.error("A IA não retornou tags. Tente novamente.");
        return;
      }
      onChange(meta.tags);
      toast.success(`${meta.tags.length} tags geradas`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar tags");
    } finally {
      setBusy(false);
    }
  };

  const chars = totalLen(value);
  const charsClass = chars > MAX_TOTAL_CHARS ? "text-red-400" : chars > 420 ? "text-amber-400" : "text-muted-foreground";
  const countClass = value.length < 15 ? "text-amber-400" : value.length > MAX_TAGS ? "text-red-400" : "text-emerald-400";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[11px] text-muted-foreground">Tags SEO do YouTube</Label>
        <div className="flex items-center gap-2 text-[10px]">
          <span className={countClass}>{value.length}/{MAX_TAGS} tags</span>
          <span className={charsClass}>{chars}/{MAX_TOTAL_CHARS} chars</span>
        </div>
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 rounded-md border border-border/50 bg-background/30 p-2">
          {value.map((t, i) => (
            <Badge key={`${t}-${i}`} variant="outline" className="gap-1 pl-2 pr-1 text-[11px] border-red-400/30 bg-red-500/5 text-red-100">
              {t}
              <button
                type="button"
                onClick={() => removeTag(i)}
                disabled={disabled || busy}
                className="ml-0.5 rounded p-0.5 hover:bg-red-500/20"
                aria-label={`Remover ${t}`}
              >
                <X size={10} />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => { if (draft) { addTag(draft); setDraft(""); } }}
          placeholder="Digite uma tag e pressione Enter (ou separe por vírgula)"
          disabled={disabled || busy}
          className="h-8 text-xs"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={regenerate}
          disabled={disabled || busy}
          className="h-8 gap-1 border-gold/40 text-gold hover:bg-gold/10 shrink-0"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          Gerar com IA
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Recomendado 15–30 tags. Limite total de {MAX_TOTAL_CHARS} caracteres (regra do YouTube).
      </p>
    </div>
  );
}
