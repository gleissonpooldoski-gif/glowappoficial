import { useEffect, useMemo, useState } from "react";
import { Instagram, Loader2, CheckCircle2, AlertCircle, Clock, Trash2, Calendar, ScrollText, RotateCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { listInstagramPosts, InstagramPost, ACCOUNTS, getInstagramStatus } from "@/lib/instagram";
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
  const [selectedPost, setSelectedPost] = useState<InstagramPost | null>(null);

  const load = async () => {
    try {
      const nextPosts = await listInstagramPosts();
      setPosts(nextPosts);
      const publishing = nextPosts.filter((p) => p.status === "PUBLICANDO" && p.container_id);
      if (publishing.length > 0) {
        const results = await Promise.allSettled(publishing.map((p) => getInstagramStatus(p.id)));
        if (results.some((r) => r.status === "fulfilled" && ["PUBLICADO", "ERRO"].includes((r.value as any)?.status))) {
          setPosts(await listInstagramPosts());
        }
      }
    }
    catch (e: any) { toast.error(e?.message ?? "Falha ao carregar"); setPosts([]); }
  };

  useEffect(() => {
    load();
    const t = window.setInterval(load, 5000);
    return () => window.clearInterval(t);
  }, []);

  const remove = async (id: string) => {
    if (!confirm("Excluir esta publicação do histórico?")) return;
    const { error } = await (supabase as any).from("instagram_posts").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removida");
    load();
  };

  const retry = async (id: string) => {
    if (!confirm("Retentar? O vídeo voltará para Vídeos Prontos para nova publicação.")) return;
    const { error } = await (supabase as any).from("instagram_posts").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Vídeo devolvido para Vídeos Prontos");
    load();
  };

  const groups = useMemo(() => {
    const list = posts ?? [];
    return {
      scheduled: list.filter((p) => p.status === "AGENDADO" || p.status === "PUBLICANDO"),
      published: list.filter((p) => p.status === "PUBLICADO"),
      errors: list.filter((p) => p.status === "ERRO"),
    };
  }, [posts]);

  const renderGrid = (items: InstagramPost[], emptyMsg: string) => {
    if (items.length === 0) {
      return (
        <Card className="glass border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Instagram className="text-gold" />
            <p className="text-sm text-muted-foreground">{emptyMsg}</p>
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => {
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
                  <div className="flex items-center gap-1">
                    {p.status === "ERRO" && (
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-gold"
                        onClick={() => retry(p.id)} title="Retentar (volta para Vídeos Prontos)">
                        <RotateCcw size={12} />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-gold"
                      onClick={() => setSelectedPost(p)} title="Ver logs">
                      <ScrollText size={12} />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(p.id)} title="Excluir">
                      <Trash2 size={12} />
                    </Button>
                  </div>
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
    );
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Publicações</h1>
        <p className="text-sm text-muted-foreground">Fila de agendamentos, publicações confirmadas e erros.</p>
      </header>

      {!posts ? (
        <div className="py-12 text-center text-muted-foreground text-sm">
          <Loader2 className="mx-auto animate-spin text-gold" />
        </div>
      ) : (
        <Tabs defaultValue="scheduled" className="space-y-4">
          <TabsList>
            <TabsTrigger value="scheduled">
              Agendados <Badge variant="outline" className="ml-2 text-[10px]">{groups.scheduled.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="published">
              Publicados <Badge variant="outline" className="ml-2 text-[10px]">{groups.published.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="errors">
              Erros <Badge variant="outline" className="ml-2 text-[10px]">{groups.errors.length}</Badge>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="scheduled">
            {renderGrid(groups.scheduled, "Nenhum vídeo agendado. Use Agendar em Vídeos Prontos.")}
          </TabsContent>
          <TabsContent value="published">
            {renderGrid(groups.published, "Ainda não há vídeos publicados.")}
          </TabsContent>
          <TabsContent value="errors">
            {renderGrid(groups.errors, "Sem erros — tudo funcionando.")}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={!!selectedPost} onOpenChange={(open) => !open && setSelectedPost(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScrollText size={16} className="text-gold" /> Logs da publicação
            </DialogTitle>
            <DialogDescription>
              Diagnóstico completo da URL, criação do container, polling de status e publicação na Meta.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[520px] rounded-md border border-border/60 bg-muted/20 p-3">
            <div className="space-y-3 pr-3">
              {selectedPost?.video_url && (
                <div className="rounded-md border border-border/50 p-2 text-[11px]">
                  <div className="mb-1 font-medium text-gold">URL enviada para a Meta</div>
                  <p className="break-all text-muted-foreground">{selectedPost.video_url}</p>
                </div>
              )}
              {selectedPost?.container_id && (
                <div className="rounded-md border border-border/50 p-2 text-[11px]">
                  <div className="mb-1 font-medium text-gold">creation_id</div>
                  <p className="break-all text-muted-foreground">{selectedPost.container_id}</p>
                </div>
              )}
              {selectedPost?.publish_id && (
                <div className="rounded-md border border-border/50 p-2 text-[11px]">
                  <div className="mb-1 font-medium text-gold">publish_id</div>
                  <p className="break-all text-muted-foreground">{selectedPost.publish_id}</p>
                </div>
              )}
              {(selectedPost?.logs ?? []).length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhum log registrado.</p>
              ) : (
                selectedPost!.logs.map((log, index) => (
                  <div key={index} className="rounded-md border border-border/50 bg-background/70 p-2">
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-medium text-gold">{log?.event ?? `log_${index + 1}`}</span>
                      {log?.ts && <span className="text-muted-foreground">{format(new Date(log.ts), "dd/MM HH:mm:ss", { locale: ptBR })}</span>}
                    </div>
                    <pre className="whitespace-pre-wrap break-words text-[10px] leading-relaxed text-muted-foreground">
                      {JSON.stringify(log, null, 2)}
                    </pre>
                  </div>
                ))
              )}
              {selectedPost?.error_message && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive">
                  <div className="mb-1 font-medium">Erro salvo</div>
                  <pre className="whitespace-pre-wrap break-words">{selectedPost.error_message}</pre>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
