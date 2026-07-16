import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  scheduled_at: string;
  networks: string[];
  status: string;
  caption: string;
};

export default function CalendarPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(new Date());
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 }).toISOString();
      const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 }).toISOString();
      const { data } = await supabase
        .from("scheduled_posts")
        .select("id, scheduled_at, networks, status, posts(caption)")
        .gte("scheduled_at", start)
        .lte("scheduled_at", end)
        .order("scheduled_at");
      setItems(
        ((data ?? []) as any[]).map((r) => ({
          id: r.id,
          scheduled_at: r.scheduled_at,
          networks: r.networks ?? [],
          status: r.status,
          caption: r.posts?.caption ?? "",
        }))
      );
      setLoading(false);
    })();
  }, [user?.id, cursor]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Calendário</h1>
          <p className="text-sm text-muted-foreground">
            Visualize e gerencie seus posts agendados.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor(subMonths(cursor, 1))}>
            <ChevronLeft size={14} />
          </Button>
          <div className="min-w-[160px] text-center text-sm font-medium capitalize">
            {format(cursor, "MMMM yyyy", { locale: ptBR })}
          </div>
          <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight size={14} />
          </Button>
          <Button variant="outline" onClick={() => setCursor(new Date())}>
            Hoje
          </Button>
          <Button asChild className="gap-1.5">
            <Link to="/new">
              <Plus size={14} /> Novo
            </Link>
          </Button>
        </div>
      </header>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/30 text-xs font-medium">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
            <div key={d} className="px-2 py-2 text-center text-muted-foreground">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const inMonth = isSameMonth(day, cursor);
            const today = isSameDay(day, new Date());
            const dayItems = items.filter((i) => isSameDay(new Date(i.scheduled_at), day));
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "min-h-[110px] border-b border-r p-1.5 text-xs",
                  !inMonth && "bg-muted/20 text-muted-foreground/50"
                )}
              >
                <div
                  className={cn(
                    "mb-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                    today && "bg-primary text-primary-foreground font-semibold"
                  )}
                >
                  {format(day, "d")}
                </div>
                <div className="space-y-1">
                  {dayItems.slice(0, 3).map((it) => (
                    <button
                      key={it.id}
                      onClick={() => navigate(`/new/${it.id}`)}
                      className="block w-full truncate rounded-sm border bg-background px-1.5 py-1 text-left text-[11px] hover:bg-accent"
                    >
                      <span className="text-muted-foreground">
                        {format(new Date(it.scheduled_at), "HH:mm")}
                      </span>{" "}
                      {it.caption || "Sem legenda"}
                    </button>
                  ))}
                  {dayItems.length > 3 && (
                    <div className="text-[10px] text-muted-foreground">
                      +{dayItems.length - 3} mais
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!loading && items.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Nenhum post agendado neste período.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">Instagram</Badge>
        <Badge variant="outline">TikTok</Badge>
        <span>· Clique em um post para editar</span>
      </div>
    </div>
  );
}
