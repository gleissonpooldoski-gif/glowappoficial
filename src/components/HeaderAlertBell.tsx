import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { useHealthBadge } from "@/hooks/useHealthBadge";
import { cn } from "@/lib/utils";

export default function HeaderAlertBell() {
  const navigate = useNavigate();
  const count = useHealthBadge();
  const hasAlerts = count > 0;

  return (
    <button
      onClick={() => navigate("/publications-issues")}
      className={cn(
        "relative flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition",
        hasAlerts
          ? "border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20"
          : "border-border/60 bg-card/60 text-muted-foreground hover:bg-card"
      )}
      title={hasAlerts ? `${count} publicação(ões) precisam de atenção` : "Sem alertas"}
    >
      <Bell size={14} className={hasAlerts ? "animate-pulse" : ""} />
      {hasAlerts ? (
        <>
          <span className="hidden sm:inline">
            {count} {count === 1 ? "publicação precisa" : "publicações precisam"} de atenção
          </span>
          <span className="sm:hidden font-semibold">{count}</span>
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        </>
      ) : (
        <span className="hidden sm:inline">Sem alertas</span>
      )}
    </button>
  );
}
