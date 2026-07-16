import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, addMonths, subMonths, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Copy, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";

interface Scheduled {
  id: string;
  post_id: string;
  scheduled_at: string;
  networks: string[];
  caption: string;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const [current, setCurrent] = useState(new Date());
  const [items, setItems] = useState<Scheduled[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const from = startOfMonth(current);
    const to = endOfMonth(current);
    const { data } = await supabase
      .from("scheduled_posts")
      .select("id, post_id, scheduled_at, networks, posts(caption)")
      .gte("scheduled_at", from.toISOString())
      .lte("scheduled_at", to.toISOString())
      .order("scheduled_at", { ascending: true });
    setItems(
      (data ?? []).map((r: any) => ({
        id: r.id,
        post_id: r.post_id,
        scheduled_at: r.scheduled_at,
        networks: r.networks,
        caption: r.posts?.caption ?? "",
      }))
    );
  };

  useEffect(() => {
    load();
  }, [user, current]);

  const start = startOfWeek(startOfMonth(current), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(current), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  const move = async (id: string, newDate: Date) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const old = parseISO(item.scheduled_at);
    const merged = new Date(newDate);
    merged.setHours(old.getHours(), old.getMinutes(), 0, 0);
    const { error } = await supabase.from("scheduled_posts").update({ scheduled_at: merged.toISOString() }).eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Post movido");
    load();
  };

  const changeTime = async (id: string, time: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const [h, m] = time.split(":").map(Number);
    const d = parseISO(item.scheduled_at);
    d.setHours(h, m, 0, 0);
    await supabase.from("scheduled_posts").update({ scheduled_at: d.toISOString() }).eq("id", id);
    toast.success("Horário atualizado");
    load();
  };

  const duplicate = async (item: Scheduled) => {
    if (!user) return;
    const d = parseISO(item.scheduled_at);
    d.setDate(d.getDate() + 1);
    await supabase.from("scheduled_posts").insert({
      user_id: user.id,
      post_id: item.post_id,
      scheduled_at: d.toISOString(),
      networks: item.networks as any,
      status: "scheduled",
    });
    toast.success("Post duplicado");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta postagem agendada?")) return;
    await supabase.from("scheduled_posts").delete().eq("id", id);
    toast.success("Removido");
    load();
  };

  return (
    <div>
      <PageHeader
        title="Calendário"
        description="Visão mensal dos seus agendamentos"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrent(subMonths(current, 1))}><ChevronLeft size={16} /></Button>
            <div className="text-sm font-medium min-w-[130px] text-center">{format(current, "MMMM yyyy", { locale: ptBR })}</div>
            <Button variant="outline" size="icon" onClick={() => setCurrent(addMonths(current, 1))}><ChevronRight size={16} /></Button>
          </div>
        }
      />

      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border">
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
          <div key={d} className="bg-secondary/60 py-1.5 text-center text-[11px] font-medium text-muted-foreground">{d}</div>
        ))}
        {days.map((d) => {
          const dayPosts = items.filter((i) => isSameDay(parseISO(i.scheduled_at), d));
          const isToday = isSameDay(d, new Date());
          const inMonth = isSameMonth(d, current);
          return (
            <div
              key={d.toISOString()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => draggedId && move(draggedId, d)}
              className={`bg-background min-h-[110px] p-1.5 ${!inMonth ? "opacity-40" : ""}`}
            >
              <div className={`text-xs font-medium mb-1 flex items-center gap-1 ${isToday ? "text-primary" : ""}`}>
                <span className={isToday ? "h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px]" : ""}>
                  {format(d, "d")}
                </span>
              </div>
              <div className="space-y-1">
                {dayPosts.map((p) => (
                  <Popover key={p.id}>
                    <PopoverTrigger asChild>
                      <div
                        draggable
                        onDragStart={() => setDraggedId(p.id)}
                        onDragEnd={() => setDraggedId(null)}
                        className="cursor-grab active:cursor-grabbing rounded px-1.5 py-1 text-[10px] bg-secondary hover:bg-secondary/80 transition-colors"
                      >
                        <div className="flex gap-0.5 mb-0.5">
                          {p.networks.map((n) => (
                            <div key={n} className="h-1 flex-1 rounded" style={{ background: n === "instagram" ? "hsl(var(--instagram))" : "hsl(var(--tiktok))" }} />
                          ))}
                        </div>
                        <div className="font-medium">{format(parseISO(p.scheduled_at), "HH:mm")}</div>
                        <div className="truncate text-muted-foreground">{p.caption || "Sem legenda"}</div>
                      </div>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" align="start">
                      <div className="text-xs mb-2">
                        <div className="font-medium">{format(parseISO(p.scheduled_at), "EEEE, d 'de' MMM", { locale: ptBR })}</div>
                        <div className="text-muted-foreground line-clamp-2 mt-1">{p.caption || "Sem legenda"}</div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-12">Horário</span>
                          <Input
                            type="time"
                            defaultValue={format(parseISO(p.scheduled_at), "HH:mm")}
                            onBlur={(e) => changeTime(p.id, e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="flex gap-1 pt-1">
                          <Link to={`/new/${p.post_id}`} className="flex-1">
                            <Button size="sm" variant="outline" className="w-full h-8"><Pencil size={12} className="mr-1" />Editar</Button>
                          </Link>
                          <Button size="sm" variant="outline" className="h-8" onClick={() => duplicate(p)}><Copy size={12} /></Button>
                          <Button size="sm" variant="outline" className="h-8 text-destructive" onClick={() => remove(p.id)}><Trash2 size={12} /></Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded" style={{ background: "hsl(var(--instagram))" }} /> Instagram</div>
        <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded" style={{ background: "hsl(var(--tiktok))" }} /> TikTok</div>
        <div className="ml-auto">Arraste para mover · Clique para editar</div>
      </div>
    </div>
  );
}
