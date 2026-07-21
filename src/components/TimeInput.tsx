import { useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: string; // "HH:MM"
  onChange: (v: string) => void;
  className?: string;
};

function clamp(n: number, min: number, max: number) {
  if (isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
const pad = (n: number) => String(n).padStart(2, "0");

export default function TimeInput({ value, onChange, className }: Props) {
  const [h, m] = (value ?? "00:00").split(":");
  const [hh, setHH] = useState(h ?? "00");
  const [mm, setMM] = useState(m ?? "00");
  const mmRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const [nh, nm] = (value ?? "00:00").split(":");
    setHH(nh ?? "00");
    setMM(nm ?? "00");
  }, [value]);

  const commit = (nh: string, nm: string) => {
    const H = clamp(parseInt(nh || "0", 10), 0, 23);
    const M = clamp(parseInt(nm || "0", 10), 0, 59);
    onChange(`${pad(H)}:${pad(M)}`);
  };

  const bumpH = (delta: number) => {
    const H = (clamp(parseInt(hh || "0", 10), 0, 23) + delta + 24) % 24;
    setHH(pad(H));
    commit(pad(H), mm);
  };
  const bumpM = (delta: number) => {
    const M = (clamp(parseInt(mm || "0", 10), 0, 59) + delta + 60) % 60;
    setMM(pad(M));
    commit(hh, pad(M));
  };

  const onHKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") { e.preventDefault(); bumpH(1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); bumpH(-1); }
    else if (e.key === ":" || e.key === "Enter" || e.key === "Tab" && !e.shiftKey) {
      if (e.key === ":") { e.preventDefault(); mmRef.current?.focus(); mmRef.current?.select(); }
    }
  };
  const onMKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") { e.preventDefault(); bumpM(1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); bumpM(-1); }
  };

  return (
    <div className={cn("inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-2 py-1", className)}>
      <div className="flex items-center">
        <input
          type="text"
          inputMode="numeric"
          maxLength={2}
          value={hh}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 2);
            setHH(v);
            if (v.length === 2) {
              commit(v, mm);
              mmRef.current?.focus();
              mmRef.current?.select();
            }
          }}
          onBlur={() => { const v = pad(clamp(parseInt(hh || "0", 10), 0, 23)); setHH(v); commit(v, mm); }}
          onKeyDown={onHKey}
          className="w-8 bg-transparent text-center text-sm font-mono tabular-nums focus:outline-none"
          aria-label="Horas"
        />
        <div className="flex flex-col -space-y-1">
          <button type="button" onClick={() => bumpH(1)} className="text-muted-foreground hover:text-foreground" aria-label="Aumentar hora">
            <ChevronUp size={12} />
          </button>
          <button type="button" onClick={() => bumpH(-1)} className="text-muted-foreground hover:text-foreground" aria-label="Diminuir hora">
            <ChevronDown size={12} />
          </button>
        </div>
      </div>
      <span className="text-sm font-mono text-muted-foreground">:</span>
      <div className="flex items-center">
        <input
          ref={mmRef}
          type="text"
          inputMode="numeric"
          maxLength={2}
          value={mm}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 2);
            setMM(v);
            if (v.length === 2) commit(hh, v);
          }}
          onBlur={() => { const v = pad(clamp(parseInt(mm || "0", 10), 0, 59)); setMM(v); commit(hh, v); }}
          onKeyDown={onMKey}
          className="w-8 bg-transparent text-center text-sm font-mono tabular-nums focus:outline-none"
          aria-label="Minutos"
        />
        <div className="flex flex-col -space-y-1">
          <button type="button" onClick={() => bumpM(5)} className="text-muted-foreground hover:text-foreground" aria-label="Aumentar minuto">
            <ChevronUp size={12} />
          </button>
          <button type="button" onClick={() => bumpM(-5)} className="text-muted-foreground hover:text-foreground" aria-label="Diminuir minuto">
            <ChevronDown size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
