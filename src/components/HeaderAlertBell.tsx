import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { useHealthBadge } from "@/hooks/useHealthBadge";
import { cn } from "@/lib/utils";

export default function HeaderAlertBell() {
  const navigate = useNavigate();
  const { posts, connections, total } = useHealthBadge();
  const hasAlerts = total > 0;

  const parts: string[] = [];
  if (posts > 0) parts.push(`${posts} ${posts === 1 ? "publicação" : "publicações"}`);
  if (connections > 0) parts.push(`${connections} ${connections === 1 ? "conta" : "contas"} a reconectar`);
  const label = parts.join(" · ");

  return (
    <button
      onClick={() => navigate("/publications-issues")}
      className={cn(
        "relative flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition",
        hasAlerts
          ? "border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20"
          : "border-border/60 bg-card/60 text-muted-foreground hover:bg-card"
      )}
      title={hasAlerts ? `Precisa de atenção: ${label}` : "Sem alertas"}
    >
      <Bell size={14} className={hasAlerts ? "animate-pulse" : ""} />
      {hasAlerts ? (
        <>
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden font-semibold">{total}</span>
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {total > 99 ? "99+" : total}
          </span>
        </>
      ) : (
        <span className="hidden sm:inline">Sem alertas</span>
      )}
    </button>
  );
}
