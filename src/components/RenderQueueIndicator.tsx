import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRenderQueue, type RenderPhase } from "@/context/RenderQueueContext";
import { Loader2, CheckCircle2, AlertCircle, X, Rocket, ChevronLeft, ChevronRight, Clock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const PHASE_LABEL: Record<RenderPhase, string> = {
  queued: "Na fila",
  preparing: "Preparando",
  rendering: "Renderizando",
  finalizing: "Finalizando",
  completed: "Concluído",
  failed: "Erro",
};

function fmtEta(ms: number | null) {
  if (ms === null || !isFinite(ms) || ms <= 0) return null;
  const s = Math.round(ms / 1000);
  if (s < 60) return `~${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `~${m}m${rest ? ` ${rest}s` : ""}`;
}

export default function RenderQueueIndicator() {
  const { jobs, dismiss, concurrency, activeCount, pendingCount, queuePosition } = useRenderQueue();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  if (jobs.length === 0) return null;

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed left-0 top-1/2 z-[60] -translate-y-1/2 flex items-center gap-1.5 rounded-r-lg border border-l-0 border-border/60 bg-background/95 px-2 py-3 backdrop-blur hover:bg-muted"
        title="Mostrar renderizações"
      >
        <Rocket size={14} className="text-gold" />
        <span className="rounded-full bg-gold/20 px-1.5 py-0.5 text-[10px] text-gold">
          {activeCount + pendingCount || jobs.length}
        </span>
        <ChevronRight size={12} className="text-muted-foreground" />
      </button>
    );
  }

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-[60] flex w-[300px] flex-col gap-2">
      <div className="pointer-events-auto rounded-t-lg border border-border/60 bg-background/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-2 text-xs font-medium">
          <Rocket size={13} className="text-gold" />
          Renderizações
          <span className="ml-auto rounded-full bg-gold/20 px-2 py-0.5 text-[10px] text-gold">
            {activeCount} ativos
          </span>
          <button
            onClick={() => setCollapsed(true)}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted"
            title="Recolher"
          >
            <ChevronLeft size={12} />
          </button>
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground">
          {pendingCount > 0 ? `${pendingCount} iniciando · ` : ""}
          modo paralelo total: tudo renderiza junto
        </div>

      </div>
      <div className="pointer-events-auto max-h-[50vh] space-y-1.5 overflow-y-auto rounded-b-lg border border-t-0 border-border/60 bg-background/95 p-2 backdrop-blur">
        {jobs.map((j) => {
          const isDone = j.phase === "completed";
          const isFail = j.phase === "failed";
          const isQueued = j.phase === "queued";
          const pos = isQueued ? queuePosition(j.id) : null;
          const eta = fmtEta(j.etaMs);
          return (
            <div key={j.id} className="rounded-md border border-border/50 bg-card/60 p-2 text-xs">
              <div className="flex items-center gap-2">
                {isDone ? (
                  <CheckCircle2 size={13} className="text-emerald-400" />
                ) : isFail ? (
                  <AlertCircle size={13} className="text-destructive" />
                ) : isQueued ? (
                  <Clock size={13} className="text-muted-foreground" />
                ) : (
                  <Loader2 size={13} className="animate-spin text-gold" />
                )}
                <span className="truncate font-medium">{j.name}</span>
                {j.priority && !isDone && !isFail && (
                  <Zap size={11} className="shrink-0 text-gold" aria-label="Prioridade máxima" />
                )}
                <span className="ml-auto whitespace-nowrap text-[10px] text-muted-foreground">
                  {isDone ? "Pronto" : isFail ? "Falhou" : isQueued ? (pos ? `#${pos}` : "Na fila") : `${j.progress}%`}
                </span>
                {(isDone || isFail || isQueued) && (
                  <button
                    onClick={() => dismiss(j.id)}
                    className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-muted"
                    title={isQueued ? "Remover da fila" : "Dispensar"}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
              {!isDone && !isFail && (
                <>
                  <div className="mt-1.5 h-1 overflow-hidden rounded bg-muted">
                    <div
                      className={cn("h-full bg-gold-gradient transition-all")}
                      style={{ width: `${j.progress}%` }}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{PHASE_LABEL[j.phase]}</span>
                    {eta && <span>{eta} restantes</span>}
                  </div>
                </>
              )}
              {isFail && j.error && (
                <div className="mt-1 truncate text-[10px] text-destructive">{j.error}</div>
              )}
              {isDone && (
                <button
                  onClick={() => navigate("/finished")}
                  className="mt-1 text-[10px] text-gold hover:underline"
                >
                  Ver em Vídeos Prontos →
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
