import { useEffect, useMemo, useState } from "react";
import {
  Instagram, Youtube, Loader2, CheckCircle2, AlertCircle, Clock, Trash2, Calendar,
  ScrollText, RotateCcw, Pencil, ExternalLink, Filter, Share2,
} from "lucide-react";
import EditPostNetworksDialog from "@/components/EditPostNetworksDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  listInstagramPosts, InstagramPost, ACCOUNTS, InstagramAccount, getInstagramStatus,
} from "@/lib/instagram";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import MultiScheduleTimeline from "@/components/MultiScheduleTimeline";

/* ---------- visual identity per platform ---------- */

const PLATFORM_META: Record<InstagramAccount, {
  label: string; badge: string; ring: string; tint: string; icon: string; text: string;
}> = {
  frame: {
    label: "Frame",
    badge: "bg-blue-500/15 text-blue-300 border-blue-400/40",
    ring: "border-blue-400/30",
    tint: "from-blue-500/10 to-transparent",
    icon: "text-blue-300",
    text: "text-blue-300",
  },
  resenha: {
    label: "Resenha",
    badge: "bg-purple-500/15 text-purple-300 border-purple-400/40",
    ring: "border-purple-400/30",
    tint: "from-purple-500/10 to-transparent",
    icon: "text-purple-300",
    text: "text-purple-300",
  },
};

const statusStyles: Record<InstagramPost["status"], string> = {
  AGENDADO: "border-blue-400/40 text-blue-300 bg-blue-500/10",
  PUBLICANDO: "border-amber-400/40 text-amber-300 bg-amber-500/10",
  PUBLICADO: "border-emerald-400/40 text-emerald-300 bg-emerald-500/10",
  ERRO: "border-destructive/40 text-destructive bg-destructive/10",
};

const statusIcon: Record<InstagramPost["status"], JSX.Element> = {
  AGENDADO: <Clock size={12} className="mr-1" />,
  PUBLICANDO: <Loader2 size={12} className="mr-1 animate-spin" />,
  PUBLICADO: <CheckCircle2 size={12} className="mr-1" />,
  ERRO: <AlertCircle size={12} className="mr-1" />,
};

type StatusFilter = "all" | "scheduled" | "published" | "failed";
type PeriodFilter = "all" | "today" | "7d" | "30d" | "custom";

/* ---------- edit scheduled post dialog ---------- */

function EditScheduledDialog({
  post, open, onOpenChange, onSaved,
}: {
  post: InstagramPost | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!post) return;
    setCaption(post.caption ?? "");
    setHashtags(post.hashtags ?? "");
    if (post.scheduled_at) {
      const d = new Date(post.scheduled_at);
      const pad = (n: number) => String(n).padStart(2, "0");
      setDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    } else {
      setDate(""); setTime("");
    }
  }, [post]);

  const save = async () => {
    if (!post) return;
    setSaving(true);
    try {
      let scheduled_at = post.scheduled_at;
      if (date && time) {
        const [y, m, d] = date.split("-").map(Number);
        const [hh, mm] = time.split(":").map(Number);
        scheduled_at = new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0).toISOString();
      }
      const { error } = await (supabase as any)
        .from("instagram_posts")
        .update({ caption, hashtags, scheduled_at })
        .eq("id", post.id);
      if (error) throw error;
      toast.success("Agendamento atualizado");
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil size={16} className="text-gold" /> Editar agendamento
          </DialogTitle>
          <DialogDescription>Altere legenda, hashtags ou o horário planejado.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Horário</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Legenda</Label>
            <Textarea rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hashtags</Label>
            <Textarea rows={2} value={hashtags} onChange={(e) => setHashtags(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving} className="bg-gold-gradient text-black">
            {saving && <Loader2 size={12} className="mr-1 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- post card ---------- */

function PostCard({
  post, kind, linkedYT, onEdit, onCancel, onDelete, onRetry, onLogs, onEditNetworks,
}: {
  post: InstagramPost;
  kind: "scheduled" | "published";
  linkedYT?: { status: string } | null;
  onEdit: (p: InstagramPost) => void;
  onCancel: (p: InstagramPost) => void;
  onDelete: (p: InstagramPost) => void;
  onRetry: (p: InstagramPost) => void;
  onLogs: (p: InstagramPost) => void;
  onEditNetworks: (p: InstagramPost) => void;
}) {
  const meta = PLATFORM_META[post.account];
  const dt =
    kind === "scheduled" && post.scheduled_at
      ? new Date(post.scheduled_at)
      : post.published_at
      ? new Date(post.published_at)
      : new Date(post.created_at);
  const permalink = (post as any).permalink as string | undefined;

  return (
    <Card className={`glass border ${meta.ring} overflow-hidden`}>
      <div className="relative aspect-video bg-black/60">
        {post.thumbnail_url ? (
          <img src={post.thumbnail_url} alt="" className="h-full w-full object-cover opacity-90" />
        ) : (
          <div className={`flex h-full items-center justify-center bg-gradient-to-b ${meta.tint}`}>
            <Instagram size={28} className={meta.icon} />
          </div>
        )}
        <Badge variant="outline" className={`absolute left-2 top-2 text-[10px] font-semibold ${meta.badge}`}>
          {meta.label.toUpperCase()}
        </Badge>
        <Badge variant="outline" className={`absolute right-2 top-2 text-[10px] ${statusStyles[post.status]}`}>
          {statusIcon[post.status]} {post.status}
        </Badge>
      </div>
      <CardContent className="space-y-2 p-3">
        {/* Histórico por rede */}
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant="outline" className="text-[10px] gap-1 border-pink-400/40 text-pink-300 bg-pink-500/10">
            <Instagram size={10} /> Instagram: {post.status.toLowerCase()}
          </Badge>
          {linkedYT && (
            <Badge variant="outline" className="text-[10px] gap-1 border-red-400/40 text-red-300 bg-red-500/10">
              <Youtube size={10} /> YouTube: {linkedYT.status.toLowerCase()}
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Calendar size={11} />
            <span>{format(dt, "dd/MM/yyyy", { locale: ptBR })}</span>
            <Clock size={11} className="ml-1" />
            <span>{format(dt, "HH:mm", { locale: ptBR })}</span>
          </div>
          <div className="flex items-center gap-0.5">
            {kind === "scheduled" && post.status === "AGENDADO" && (
              <>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-gold"
                  onClick={() => onEditNetworks(post)} title="Editar redes de publicação">
                  <Share2 size={12} />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-gold"
                  onClick={() => onEdit(post)} title="Editar">
                  <Pencil size={12} />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => onCancel(post)} title="Cancelar agendamento">
                  <Trash2 size={12} />
                </Button>
              </>
            )}
            {post.status === "ERRO" && (
              <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-gold"
                onClick={() => onRetry(post)} title="Retentar">
                <RotateCcw size={12} />
              </Button>
            )}
            {kind === "published" && permalink && (
              <a href={permalink} target="_blank" rel="noreferrer"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-gold"
                title="Abrir publicação">
                <ExternalLink size={12} />
              </a>
            )}
            <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-gold"
              onClick={() => onLogs(post)} title="Ver logs">
              <ScrollText size={12} />
            </Button>
            {kind === "published" && (
              <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => onDelete(post)} title="Excluir do histórico">
                <Trash2 size={12} />
              </Button>
            )}
          </div>
        </div>
        <p className="line-clamp-3 text-xs text-foreground/80 whitespace-pre-wrap">
          {post.caption || <span className="text-muted-foreground italic">(sem legenda)</span>}
        </p>
        {post.hashtags && <p className="line-clamp-2 text-[10px] text-muted-foreground">{post.hashtags}</p>}
        {post.error_message && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-1.5 text-[10px] text-destructive">
            {post.error_message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- platform section (Agendados + Publicados) ---------- */

function PlatformSection({
  account, posts, statusFilter, ytByKey, ...handlers
}: {
  account: InstagramAccount;
  posts: InstagramPost[];
  statusFilter: StatusFilter;
  ytByKey: Map<string, { status: string }>;
  onEdit: (p: InstagramPost) => void;
  onCancel: (p: InstagramPost) => void;
  onDelete: (p: InstagramPost) => void;
  onRetry: (p: InstagramPost) => void;
  onLogs: (p: InstagramPost) => void;
  onEditNetworks: (p: InstagramPost) => void;
}) {
  const meta = PLATFORM_META[account];
  const own = posts.filter((p) => p.account === account);

  const scheduled = own
    .filter((p) => p.status === "AGENDADO" || p.status === "PUBLICANDO")
    .sort((a, b) => {
      const av = new Date(a.scheduled_at ?? a.created_at).getTime();
      const bv = new Date(b.scheduled_at ?? b.created_at).getTime();
      return av - bv; // próximos primeiro
    });
  const published = own
    .filter((p) => p.status === "PUBLICADO")
    .sort((a, b) => new Date(b.published_at ?? b.created_at).getTime() - new Date(a.published_at ?? a.created_at).getTime());
  const failed = own.filter((p) => p.status === "ERRO");

  const showScheduled = statusFilter === "all" || statusFilter === "scheduled";
  const showPublished = statusFilter === "all" || statusFilter === "published";
  const showFailed = statusFilter === "all" || statusFilter === "failed";

  const linkKey = (p: InstagramPost) => `${p.video_id ?? ""}|${p.scheduled_at ?? ""}`;

  const grid = (items: InstagramPost[], kind: "scheduled" | "published", emptyMsg: string) =>
    items.length === 0 ? (
      <Card className={`glass border-dashed ${meta.ring}`}>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <Instagram className={meta.icon} />
          <p className="text-xs text-muted-foreground">{emptyMsg}</p>
        </CardContent>
      </Card>
    ) : (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => (
          <PostCard key={p.id} post={p} kind={kind} linkedYT={ytByKey.get(linkKey(p))} {...handlers} />
        ))}
      </div>
    );

  return (
    <section className="space-y-4">
      <div className={`flex items-center justify-between rounded-lg border ${meta.ring} bg-gradient-to-r ${meta.tint} px-4 py-3`}>
        <div className="flex items-center gap-2">
          <Instagram size={18} className={meta.icon} />
          <h2 className="text-base font-semibold tracking-tight">
            📱 Publicações {meta.label}
          </h2>
          <Badge variant="outline" className={`ml-2 text-[10px] ${meta.badge}`}>{meta.label.toUpperCase()}</Badge>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>Agendados: <b className={meta.text}>{scheduled.length}</b></span>
          <span>·</span>
          <span>Publicados: <b className={meta.text}>{published.length}</b></span>
          {failed.length > 0 && (
            <>
              <span>·</span>
              <span>Erros: <b className="text-destructive">{failed.length}</b></span>
            </>
          )}
        </div>
      </div>

      {showScheduled && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Agendados</h3>
          {grid(scheduled, "scheduled", `Nenhum conteúdo agendado no ${meta.label}.`)}
        </div>
      )}

      {showPublished && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Publicados</h3>
          {grid(published, "published", `Ainda não há publicações no ${meta.label}.`)}
        </div>
      )}

      {showFailed && failed.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-destructive/80">Falhou</h3>
          {grid(failed, "scheduled", "Sem erros.")}
        </div>
      )}
    </section>
  );
}

/* ---------- page ---------- */

export default function Publications() {
  const [posts, setPosts] = useState<InstagramPost[] | null>(null);
  const [ytByKey, setYtByKey] = useState<Map<string, { status: string }>>(new Map());
  const [selectedPost, setSelectedPost] = useState<InstagramPost | null>(null);
  const [editing, setEditing] = useState<InstagramPost | null>(null);
  const [editingNetworks, setEditingNetworks] = useState<InstagramPost | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const loadYoutubeLinks = async () => {
    const { data } = await supabase
      .from("youtube_posts" as any)
      .select("video_id, scheduled_at, status")
      .not("scheduled_at", "is", null)
      .order("scheduled_at", { ascending: false })
      .limit(500);
    const map = new Map<string, { status: string }>();
    for (const r of (data ?? []) as any[]) {
      if (!r.video_id || !r.scheduled_at) continue;
      map.set(`${r.video_id}|${r.scheduled_at}`, { status: r.status });
    }
    setYtByKey(map);
  };

  const load = async () => {
    try {
      const [nextPosts] = await Promise.all([listInstagramPosts(), loadYoutubeLinks()]);
      setPosts(nextPosts);
      const publishing = nextPosts.filter((p) => p.status === "PUBLICANDO" && p.container_id);
      if (publishing.length > 0) {
        const results = await Promise.allSettled(publishing.map((p) => getInstagramStatus(p.id)));
        if (results.some((r) => r.status === "fulfilled" && ["PUBLICADO", "ERRO"].includes((r.value as any)?.status))) {
          setPosts(await listInstagramPosts());
        }
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao carregar");
      setPosts([]);
    }
  };

  useEffect(() => {
    load();
    const t = window.setInterval(load, 5000);
    return () => window.clearInterval(t);
  }, []);

  const cancelScheduled = async (p: InstagramPost) => {
    if (!confirm("Cancelar este agendamento? O vídeo voltará para Vídeos Prontos.")) return;
    const { error } = await (supabase as any).from("instagram_posts").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Agendamento cancelado");
    load();
  };
  const deletePost = async (p: InstagramPost) => {
    if (!confirm("Excluir esta publicação do histórico?")) return;
    const { error } = await (supabase as any).from("instagram_posts").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Removida");
    load();
  };
  const retry = async (p: InstagramPost) => {
    if (!confirm("Retentar? O vídeo voltará para Vídeos Prontos para nova publicação.")) return;
    const { error } = await (supabase as any).from("instagram_posts").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Vídeo devolvido para Vídeos Prontos");
    load();
  };

  /* period filter */
  const filteredPosts = useMemo(() => {
    if (!posts) return [];
    if (periodFilter === "all") return posts;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let from: Date | null = null;
    let to: Date | null = null;
    if (periodFilter === "today") {
      from = startOfToday;
      to = new Date(startOfToday.getTime() + 24 * 3600 * 1000);
    } else if (periodFilter === "7d") {
      from = startOfToday;
      to = new Date(startOfToday.getTime() + 7 * 24 * 3600 * 1000);
    } else if (periodFilter === "30d") {
      from = startOfToday;
      to = new Date(startOfToday.getTime() + 30 * 24 * 3600 * 1000);
    } else if (periodFilter === "custom") {
      if (customFrom) from = new Date(customFrom + "T00:00:00");
      if (customTo) to = new Date(customTo + "T23:59:59");
    }
    return posts.filter((p) => {
      const ref = new Date(p.scheduled_at ?? p.published_at ?? p.created_at);
      if (from && ref < from) return false;
      if (to && ref > to) return false;
      return true;
    });
  }, [posts, periodFilter, customFrom, customTo]);

  const handlers = {
    onEdit: (p: InstagramPost) => setEditing(p),
    onCancel: cancelScheduled,
    onDelete: deletePost,
    onRetry: retry,
    onLogs: (p: InstagramPost) => setSelectedPost(p),
    onEditNetworks: (p: InstagramPost) => setEditingNetworks(p),
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Publicações</h1>
        <p className="text-sm text-muted-foreground">
          Calendário independente por conta — cada plataforma organizada e visível de imediato.
        </p>
      </header>

      <MultiScheduleTimeline />

      {/* Filters */}
      <Card className="glass border-border/50">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Filter size={14} /> Filtros:
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="scheduled">Agendados</SelectItem>
                <SelectItem value="published">Publicados</SelectItem>
                <SelectItem value="failed">Falhou</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Período</Label>
            <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}>
              <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="7d">Próximos 7 dias</SelectItem>
                <SelectItem value="30d">Próximos 30 dias</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {periodFilter === "custom" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">De</Label>
                <Input type="date" className="h-8 w-40" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Até</Label>
                <Input type="date" className="h-8 w-40" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {!posts ? (
        <div className="py-12 text-center text-muted-foreground text-sm">
          <Loader2 className="mx-auto animate-spin text-gold" />
        </div>
      ) : (
        <Tabs defaultValue="all" className="space-y-6">
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="frame" className="data-[state=active]:text-blue-300">Frame</TabsTrigger>
            <TabsTrigger value="resenha" className="data-[state=active]:text-purple-300">Resenha</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-10">
            {ACCOUNTS.map((a) => (
              <PlatformSection
                key={a.value}
                account={a.value}
                posts={filteredPosts}
                statusFilter={statusFilter}
                ytByKey={ytByKey}
                {...handlers}
              />
            ))}
          </TabsContent>
          <TabsContent value="frame">
            <PlatformSection account="frame" posts={filteredPosts} statusFilter={statusFilter} ytByKey={ytByKey} {...handlers} />
          </TabsContent>
          <TabsContent value="resenha">
            <PlatformSection account="resenha" posts={filteredPosts} statusFilter={statusFilter} ytByKey={ytByKey} {...handlers} />
          </TabsContent>
        </Tabs>
      )}

      {/* Edit dialog */}
      <EditScheduledDialog
        post={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={load}
      />

      {/* Edit networks dialog */}
      <EditPostNetworksDialog
        post={editingNetworks}
        open={!!editingNetworks}
        onOpenChange={(o) => !o && setEditingNetworks(null)}
        onSaved={load}
      />

      {/* Logs dialog */}
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
