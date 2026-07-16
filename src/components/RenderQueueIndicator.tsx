import { useNavigate } from "react-router-dom";
import { useRenderQueue } from "@/context/RenderQueueContext";
import { Loader2, CheckCircle2, AlertCircle, X, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

export default function RenderQueueIndicator() {
  const { jobs, dismiss } = useRenderQueue();
  const navigate = useNavigate();
  if (jobs.length === 0) return null;

  const active = jobs.filter((j) => j.phase !== "completed" && j.phase !== "failed").length;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[320px] flex-col gap-2">
      <div className="pointer-events-auto rounded-t-lg border border-border/60 bg-background/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-2 text-xs font-medium">
          <Rocket size={13} className="text-gold" />
          Renderizações em andamento
          <span className="ml-auto rounded-full bg-gold/20 px-2 py-0.5 text-[10px] text-gold">
            {active} ativo{active === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <div className="pointer-events-auto max-h-[50vh] space-y-1.5 overflow-y-auto rounded-b-lg border border-t-0 border-border/60 bg-background/95 p-2 backdrop-blur">
        {jobs.map((j) => {
          const isDone = j.phase === "completed";
          const isFail = j.phase === "failed";
          return (
            <div key={j.id} className="rounded-md border border-border/50 bg-card/60 p-2 text-xs">
              <div className="flex items-center gap-2">
                {isDone ? (
                  <CheckCircle2 size={13} className="text-emerald-400" />
                ) : isFail ? (
                  <AlertCircle size={13} className="text-destructive" />
                ) : (
                  <Loader2 size={13} className="animate-spin text-gold" />
                )}
                <span className="truncate font-medium">{j.name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {isDone ? "Pronto" : isFail ? "Falhou" : `${j.progress}%`}
                </span>
                {(isDone || isFail) && (
                  <button
                    onClick={() => dismiss(j.id)}
                    className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-muted"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
              {!isDone && !isFail && (
                <div className="mt-1.5 h-1 overflow-hidden rounded bg-muted">
                  <div
                    className={cn("h-full bg-gold-gradient transition-all")}
                    style={{ width: `${j.progress}%` }}
                  />
                </div>
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
