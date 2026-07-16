import { useEffect, useState } from "react";
import { Instagram, Loader2, CheckCircle2, AlertCircle, Clock, Trash2, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { listInstagramPosts, InstagramPost, ACCOUNTS } from "@/lib/instagram";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const statusStyles: Record<InstagramPost["status"], string> = {
  AGENDADO: "border-blue-400/40 text-blue-300 bg-blue-500/10",
  PUBLICANDO: "border-amber-400/40 text-amber-300 bg-amber-500/10",
  PUBLICADO: "border-emerald-400/40 text-emerald-300 bg-emerald-500/10",
  ERRO: "border-destructive/40 text-destructive bg-destructive/10",
};

const statusIcon = {
  AGENDADO: <Clock size={12} className="mr-1" />,
  PUBLICANDO: <Loader2 size={12} className="mr-1 animate-spin" />,
  PUBLICADO: <CheckCircle2 size={12} className="mr-1" />,
  ERRO: <AlertCircle size={12} className="mr-1" />,
};

export default function Publications() {
  const [posts, setPosts] = useState<InstagramPost[] | null>(null);

  const load = async () => {
    try { setPosts(await listInstagramPosts()); }
    catch (e: any) { toast.error(e?.message ?? "Falha ao carregar"); setPosts([]); }
  };

  useEffect(() => {
    load();
    const t = window.setInterval(load, 8000);
    return () => window.clearInterval(t);
  }, []);

  const remove = async (id: string) => {
    if (!confirm("Excluir esta publicação do histórico?")) return;
    const { error } = await (supabase as any).from("instagram_posts").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removida");
    load();
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Publicações</h1>
        <p className="text-sm text-muted-foreground">Histórico de publicações e agendamentos do Instagram.</p>
      </header>

      {!posts ? (
        <div className="py-12 text-center text-muted-foreground text-sm">
          <Loader2 className="mx-auto animate-spin text-gold" />
        </div>
      ) : posts.length === 0 ? (
        <Card className="glass border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Instagram className="text-gold" />
            <p className="text-sm text-muted-foreground">
              Nenhuma publicação ainda. Use os botões <b>Publicar Agora</b> ou <b>Agendar</b> em Vídeos Prontos.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => {
            const accountLabel = ACCOUNTS.find((a) => a.value === p.account)?.label ?? p.account;
            return (
              <Card key={p.id} className="glass border-border/50">
                <div className="relative aspect-video bg-black/60">
                  {p.thumbnail_url ? (
                    <img src={p.thumbnail_url} alt="" className="h-full w-full object-cover opacity-80" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Instagram size={28} className="text-gold/40" />
                    </div>
                  )}
                  <Badge variant="outline" className={`absolute left-2 top-2 text-[10px] ${statusStyles[p.status]}`}>
                    {statusIcon[p.status]} {p.status}
                  </Badge>
                </div>
                <CardContent className="space-y-1.5 p-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-gold">{accountLabel}</span>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(p.id)}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                  <p className="line-clamp-3 text-xs text-foreground/80 whitespace-pre-wrap">
                    {p.caption || <span className="text-muted-foreground italic">(sem legenda)</span>}
                  </p>
                  {p.hashtags && <p className="line-clamp-2 text-[10px] text-muted-foreground">{p.hashtags}</p>}
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1">
                    <Calendar size={10} />
                    {p.status === "AGENDADO" && p.scheduled_at
                      ? `Agendado para ${format(new Date(p.scheduled_at), "dd/MM HH:mm", { locale: ptBR })}`
                      : p.published_at
                      ? `Publicado em ${format(new Date(p.published_at), "dd/MM HH:mm", { locale: ptBR })}`
                      : format(new Date(p.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </div>
                  {p.error_message && (
                    <p className="rounded-md border border-destructive/30 bg-destructive/5 p-1.5 text-[10px] text-destructive">
                      {p.error_message}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
