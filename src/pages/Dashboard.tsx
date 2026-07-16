import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { CheckCircle2, Clock, AlertCircle, CalendarClock, Link as LinkIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { NetworkIcon } from "@/components/NetworkIcon";
import { Button } from "@/components/ui/button";

interface Stats {
  published: number;
  scheduled: number;
  failed: number;
  connectedAccounts: number;
  nextPost: { scheduled_at: string; caption: string; networks: string[] } | null;
  weekPosts: Array<{ scheduled_at: string; networks: string[]; caption: string }>;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({
    published: 0, scheduled: 0, failed: 0, connectedAccounts: 0, nextPost: null, weekPosts: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [pubRes, schRes, failRes, accRes, nextRes, weekRes] = await Promise.all([
        supabase.from("publication_logs").select("id", { count: "exact", head: true }).eq("status", "published"),
        supabase.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("status", "scheduled"),
        supabase.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("status", "failed"),
        supabase.from("social_accounts").select("id", { count: "exact", head: true }).eq("status", "connected"),
        supabase.from("scheduled_posts")
          .select("scheduled_at, networks, posts(caption)")
          .eq("status", "scheduled")
          .gte("scheduled_at", new Date().toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase.from("scheduled_posts")
          .select("scheduled_at, networks, posts(caption)")
          .gte("scheduled_at", startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString())
          .lte("scheduled_at", addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 7).toISOString())
          .order("scheduled_at", { ascending: true })
      ]);

      setStats({
        published: pubRes.count ?? 0,
        scheduled: schRes.count ?? 0,
        failed: failRes.count ?? 0,
        connectedAccounts: accRes.count ?? 0,
        nextPost: nextRes.data ? {
          scheduled_at: nextRes.data.scheduled_at,
          caption: (nextRes.data.posts as any)?.caption ?? "",
          networks: nextRes.data.networks as string[],
        } : null,
        weekPosts: (weekRes.data ?? []).map((r: any) => ({
          scheduled_at: r.scheduled_at,
          networks: r.networks,
          caption: r.posts?.caption ?? "",
        })),
      });
      setLoading(false);
    })();
  }, [user]);

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const cards = [
    { label: "Publicados", value: stats.published, icon: CheckCircle2, color: "text-success" },
    { label: "Agendados", value: stats.scheduled, icon: Clock, color: "text-primary" },
    { label: "Com erro", value: stats.failed, icon: AlertCircle, color: "text-destructive" },
    { label: "Contas conectadas", value: stats.connectedAccounts, icon: LinkIcon, color: "text-primary" },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Resumo dos seus conteúdos"
        actions={<Link to="/new"><Button size="sm">Novo Post</Button></Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{c.label}</span>
                  <Icon size={16} className={c.color} />
                </div>
                <div className="mt-2 text-2xl font-semibold">{loading ? "—" : c.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Next Post */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarClock size={16} /> Próxima publicação
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.nextPost ? (
              <div>
                <p className="text-sm font-medium mb-1">
                  {format(new Date(stats.nextPost.scheduled_at), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{stats.nextPost.caption || "Sem legenda"}</p>
                <div className="flex gap-1.5">
                  {stats.nextPost.networks.map((n) => (
                    <NetworkIcon key={n} network={n as any} className={`h-3.5 w-3.5 ${n === "instagram" ? "text-instagram" : "text-tiktok"}`} />
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma publicação agendada</p>
            )}
          </CardContent>
        </Card>

        {/* Week Calendar */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Esta semana</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1.5">
              {days.map((d) => {
                const dayPosts = stats.weekPosts.filter((p) => isSameDay(new Date(p.scheduled_at), d));
                const isToday = isSameDay(d, new Date());
                return (
                  <div key={d.toISOString()} className={`rounded-md border p-2 min-h-[80px] ${isToday ? "border-primary/50 bg-secondary/40" : ""}`}>
                    <div className="text-[10px] uppercase text-muted-foreground">{format(d, "EEE", { locale: ptBR })}</div>
                    <div className="text-sm font-medium">{format(d, "d")}</div>
                    <div className="mt-1 space-y-0.5">
                      {dayPosts.slice(0, 2).map((p, i) => (
                        <div key={i} className="flex gap-0.5">
                          {p.networks.map((n) => (
                            <div
                              key={n}
                              className="h-1.5 flex-1 rounded"
                              style={{ background: n === "instagram" ? "hsl(var(--instagram))" : "hsl(var(--tiktok))" }}
                            />
                          ))}
                        </div>
                      ))}
                      {dayPosts.length > 2 && (
                        <div className="text-[9px] text-muted-foreground">+{dayPosts.length - 2}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
