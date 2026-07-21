import { useEffect, useState } from "react";
import { Youtube, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { listYoutubeChannels, YoutubeCredential } from "@/lib/youtube";

type Props = {
  value: string[];
  onChange: (accounts: string[]) => void;
  disabled?: boolean;
  compact?: boolean;
};

/** Multi-seleção de canais YouTube conectados. */
export default function YoutubeChannelPicker({ value, onChange, disabled, compact }: Props) {
  const [channels, setChannels] = useState<YoutubeCredential[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const arr = await listYoutubeChannels();
        if (cancelled) return;
        setChannels(arr);
        // Se nada selecionado, pré-seleciona o primeiro conectado.
        if (value.length === 0 && arr.length > 0) {
          onChange([arr[0].account]);
        } else if (value.length > 0) {
          // Remove seleções que não existem mais.
          const valid = value.filter((v) => arr.some((c) => c.account === v));
          if (valid.length !== value.length) onChange(valid);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (acc: string) => {
    const s = new Set(value);
    if (s.has(acc)) s.delete(acc);
    else s.add(acc);
    onChange(Array.from(s));
  };

  const toggleAll = () => {
    if (value.length === channels.length) onChange([]);
    else onChange(channels.map((c) => c.account));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Loader2 size={11} className="animate-spin" /> Carregando canais…
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/60 bg-background/30 px-3 py-2 text-[11px] text-muted-foreground">
        Nenhum canal YouTube conectado. Vá em Configurações → YouTube.
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      {channels.length > 1 && (
        <button
          type="button"
          onClick={toggleAll}
          disabled={disabled}
          className="text-[10px] font-medium text-gold hover:underline disabled:opacity-50"
        >
          {value.length === channels.length ? "Desmarcar todos" : "Selecionar todos (Ambos)"}
        </button>
      )}
      <div className="grid gap-1.5">
        {channels.map((c) => {
          const checked = value.includes(c.account);
          return (
            <label
              key={c.account}
              className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                checked ? "border-gold/50 bg-gold/5" : "border-border/60 bg-background/30 hover:bg-background/60"
              } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => toggle(c.account)}
                disabled={disabled}
              />
              {c.thumbnail ? (
                <img src={c.thumbnail} alt="" className="h-5 w-5 rounded-full object-cover" />
              ) : (
                <Youtube size={12} className="text-red-400" />
              )}
              <span className="flex-1 truncate">
                {c.channel_title ?? c.label ?? c.account}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
