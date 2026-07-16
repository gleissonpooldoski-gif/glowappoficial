import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarClock,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  Film,
  HardDrive,
  ArrowRight,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

type Stats = {
  published: number;
  scheduled: number;
  errors: number;
  next: { scheduled_at: string; caption: string } | null;
  media: { images: number; videos: number; totalBytes: number };
  lastUploads: { id: string; name: string; type: string; created_at: string }[];
};

function formatBytes(n: number) {
  const u = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string | number;
  icon: any;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <Icon size={15} className="text-muted-foreground" />
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [pubRes, schedRes, errRes, nextRes, mediaRes, uploadsRes] = await Promise.all([
        supabase.from("posts").select("*", { count: "exact", head: true }).eq("status", "published"),
        supabase
          .from("scheduled_posts")
          .select("*", { count: "exact", head: true })
          .eq("status", "scheduled"),
        supabase.from("publication_logs").select("*", { count: "exact", head: true }).eq("status", "error"),
        supabase
          .from("scheduled_posts")
          .select("scheduled_at, post_id, posts(caption)")
          .eq("status", "scheduled")
          .gte("scheduled_at", new Date().toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase.from("media").select("type, size_bytes"),
        supabase
          .from("media")
          .select("id, name, type, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const mediaRows = (mediaRes.data ?? []) as { type: string; size_bytes: number | null }[];
      const images = mediaRows.filter((m) => m.type === "image").length;
      const videos = mediaRows.filter((m) => m.type === "video").length;
      const totalBytes = mediaRows.reduce((acc, m) => acc + (m.size_bytes ?? 0), 0);

      const nextRow = nextRes.data as any;
      setStats({
        published: pubRes.count ?? 0,
        scheduled: schedRes.count ?? 0,
        errors: errRes.count ?? 0,
        next: nextRow
          ? {
              scheduled_at: nextRow.scheduled_at,
              caption: nextRow.posts?.caption ?? "",
            }
          : null,
        media: { images, videos, totalBytes },
        lastUploads: (uploadsRes.data ?? []) as any,
      });
      setLoading(false);
    })();
  }, [user?.id]);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visão geral dos seus conteúdos, agendamentos e mídia.
        </p>
      </header>

      {loading || !stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Publicados" value={stats.published} icon={CheckCircle2} />
            <StatCard label="Agendados" value={stats.scheduled} icon={CalendarClock} />
            <StatCard label="Com erro" value={stats.errors} icon={AlertCircle} />
            <StatCard
              label="Armazenamento"
              value={formatBytes(stats.media.totalBytes)}
              icon={HardDrive}
              hint={`${stats.media.images} imagens · ${stats.media.videos} vídeos`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-sm font-medium">Próxima publicação</CardTitle>
                <CalendarClock size={15} className="text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {stats.next ? (
                  <div className="space-y-3">
                    <Badge variant="secondary" className="text-xs">
                      {format(new Date(stats.next.scheduled_at), "PPP 'às' HH:mm", {
                        locale: ptBR,
                      })}
                    </Badge>
                    <p className="line-clamp-3 text-sm text-muted-foreground">
                      {stats.next.caption || "Sem legenda"}
                    </p>
                    <Link
                      to="/calendar"
                      className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                    >
                      Ver calendário <ArrowRight size={12} />
                    </Link>
                  </div>
                ) : (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    Nenhum post agendado.{" "}
                    <Link to="/new" className="text-foreground underline">
                      Criar agora
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-sm font-medium">Últimos uploads</CardTitle>
                <ImageIcon size={15} className="text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {stats.lastUploads.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    Nenhum arquivo ainda.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {stats.lastUploads.map((u) => (
                      <li key={u.id} className="flex items-center gap-2 text-xs">
                        {u.type === "image" ? (
                          <ImageIcon size={13} className="text-muted-foreground" />
                        ) : (
                          <Film size={13} className="text-muted-foreground" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{u.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(u.created_at), "dd/MM")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
