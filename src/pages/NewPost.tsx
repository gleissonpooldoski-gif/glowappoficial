import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Check,
  Film,
  Image as ImageIcon,
  Instagram,
  Loader2,
  Music2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type MediaRow = {
  id: string;
  name: string;
  type: "image" | "video";
  storage_path: string;
};
type MediaItem = MediaRow & { url: string };
type Network = "instagram" | "tiktok";

const NETWORKS: { key: Network; label: string; Icon: typeof Instagram }[] = [
  { key: "instagram", label: "Instagram", Icon: Instagram },
  { key: "tiktok", label: "TikTok", Icon: Music2 },
];

export default function NewPost() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const { user } = useAuth();
  const navigate = useNavigate();

  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [loadingLib, setLoadingLib] = useState(true);
  const [loadingPost, setLoadingPost] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [selectedMedia, setSelectedMedia] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState("09:00");
  const [networks, setNetworks] = useState<Network[]>([]);
  const scheduleIdRef = useRef<string | null>(null);
  const postIdRef = useRef<string | null>(null);

  // Load library
  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoadingLib(true);
      const { data, error } = await supabase
        .from("media")
        .select("id,name,type,storage_path")
        .order("created_at", { ascending: false });
      if (error) {
        toast.error(error.message);
        setLoadingLib(false);
        return;
      }
      const rows = (data ?? []) as MediaRow[];
      const withUrls = await Promise.all(
        rows.map(async (r) => {
          const { data: s } = await supabase.storage
            .from("media")
            .createSignedUrl(r.storage_path, 60 * 60);
          return { ...r, url: s?.signedUrl ?? "" };
        })
      );
      setLibrary(withUrls);
      setLoadingLib(false);
    })();
  }, [user?.id]);

  // Load post for edit
  useEffect(() => {
    if (!isEdit || !user) return;
    (async () => {
      setLoadingPost(true);
      const { data: sched, error } = await supabase
        .from("scheduled_posts")
        .select("id, post_id, scheduled_at, networks")
        .eq("id", id!)
        .maybeSingle();
      if (error || !sched) {
        toast.error(error?.message ?? "Post não encontrado");
        navigate("/calendar");
        return;
      }
      scheduleIdRef.current = sched.id;
      postIdRef.current = sched.post_id;
      const { data: post } = await supabase
        .from("posts")
        .select("caption, hashtags, media_ids")
        .eq("id", sched.post_id)
        .maybeSingle();
      const when = new Date(sched.scheduled_at);
      setDate(when);
      setTime(format(when, "HH:mm"));
      setNetworks((sched.networks ?? []) as Network[]);
      setCaption(post?.caption ?? "");
      setHashtags(post?.hashtags ?? "");
      setSelectedMedia((post?.media_ids ?? []) as string[]);
      setLoadingPost(false);
    })();
  }, [id, isEdit, user?.id, navigate]);

  const toggleMedia = (mid: string) =>
    setSelectedMedia((prev) =>
      prev.includes(mid) ? prev.filter((x) => x !== mid) : [...prev, mid]
    );
  const toggleNetwork = (n: Network) =>
    setNetworks((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));

  const scheduledAt = useMemo(() => {
    if (!date) return null;
    const [h, m] = time.split(":").map(Number);
    const d = new Date(date);
    d.setHours(h ?? 0, m ?? 0, 0, 0);
    return d;
  }, [date, time]);

  const canSave =
    selectedMedia.length > 0 && networks.length > 0 && scheduledAt !== null && !saving;

  const handleSave = async () => {
    if (!user || !scheduledAt) return;
    setSaving(true);
    try {
      let postId = postIdRef.current;
      if (isEdit && postId) {
        const { error: pErr } = await supabase
          .from("posts")
          .update({
            caption,
            hashtags,
            media_ids: selectedMedia,
            networks,
            status: "scheduled",
          })
          .eq("id", postId);
        if (pErr) throw pErr;
        const { error: sErr } = await supabase
          .from("scheduled_posts")
          .update({
            scheduled_at: scheduledAt.toISOString(),
            networks,
            status: "scheduled",
          })
          .eq("id", scheduleIdRef.current!);
        if (sErr) throw sErr;
        toast.success("Post atualizado");
      } else {
        const { data: post, error: pErr } = await supabase
          .from("posts")
          .insert({
            user_id: user.id,
            caption,
            hashtags,
            media_ids: selectedMedia,
            networks,
            status: "scheduled",
          })
          .select("id")
          .single();
        if (pErr) throw pErr;
        postId = post.id;
        const { error: sErr } = await supabase.from("scheduled_posts").insert({
          user_id: user.id,
          post_id: postId,
          scheduled_at: scheduledAt.toISOString(),
          networks,
          status: "scheduled",
        });
        if (sErr) throw sErr;
        toast.success("Post agendado");
      }
      navigate("/calendar");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit || !scheduleIdRef.current) return;
    if (!confirm("Excluir este post agendado?")) return;
    setSaving(true);
    try {
      const { error: sErr } = await supabase
        .from("scheduled_posts")
        .delete()
        .eq("id", scheduleIdRef.current);
      if (sErr) throw sErr;
      if (postIdRef.current) {
        await supabase.from("posts").delete().eq("id", postIdRef.current);
      }
      toast.success("Post excluído");
      navigate("/calendar");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao excluir");
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async () => {
    if (!user || !isEdit || !scheduledAt) return;
    setSaving(true);
    try {
      const { data: post, error: pErr } = await supabase
        .from("posts")
        .insert({
          user_id: user.id,
          caption,
          hashtags,
          media_ids: selectedMedia,
          networks,
          status: "draft",
        })
        .select("id")
        .single();
      if (pErr) throw pErr;
      const dup = new Date(scheduledAt);
      dup.setDate(dup.getDate() + 1);
      const { data: sched, error: sErr } = await supabase
        .from("scheduled_posts")
        .insert({
          user_id: user.id,
          post_id: post.id,
          scheduled_at: dup.toISOString(),
          networks,
          status: "scheduled",
        })
        .select("id")
        .single();
      if (sErr) throw sErr;
      toast.success("Post duplicado");
      navigate(`/new/${sched.id}`);
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao duplicar");
    } finally {
      setSaving(false);
    }
  };

  if (loadingPost) {
    return (
      <div className="flex min-h-[300px] items-center justify-center text-sm text-muted-foreground">
        <Loader2 size={16} className="mr-2 animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigate(-1)}
            aria-label="Voltar"
          >
            <ArrowLeft size={16} />
          </Button>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {isEdit ? "Editar Post" : "Novo Post"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Configure e agende um conteúdo para publicação.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEdit && (
            <>
              <Button variant="outline" onClick={handleDuplicate} disabled={saving}>
                Duplicar
              </Button>
              <Button variant="outline" onClick={handleDelete} disabled={saving}>
                Excluir
              </Button>
            </>
          )}
          <Button onClick={handleSave} disabled={!canSave}>
            {saving && <Loader2 size={14} className="mr-2 animate-spin" />}
            {isEdit ? "Salvar alterações" : "Agendar"}
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Media */}
          <section className="space-y-2">
            <Label>Selecionar mídia</Label>
            {loadingLib ? (
              <div className="flex min-h-[120px] items-center justify-center rounded-lg border text-sm text-muted-foreground">
                <Loader2 size={14} className="mr-2 animate-spin" /> Carregando...
              </div>
            ) : library.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhuma mídia na biblioteca.{" "}
                <button
                  className="text-foreground underline"
                  onClick={() => navigate("/library")}
                >
                  Enviar arquivos
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {library.map((m) => {
                  const active = selectedMedia.includes(m.id);
                  return (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => toggleMedia(m.id)}
                      className={cn(
                        "group relative aspect-square overflow-hidden rounded-md border bg-muted transition",
                        active
                          ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                          : "hover:opacity-90"
                      )}
                    >
                      {m.type === "image" ? (
                        <img
                          src={m.url}
                          alt={m.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="relative h-full w-full">
                          <video src={m.url} className="h-full w-full object-cover" muted />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/25 text-white">
                            <Film size={18} />
                          </div>
                        </div>
                      )}
                      {active && (
                        <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check size={12} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {selectedMedia.length} selecionado{selectedMedia.length === 1 ? "" : "s"}
            </p>
          </section>

          {/* Caption */}
          <section className="space-y-2">
            <Label htmlFor="caption">Legenda</Label>
            <Textarea
              id="caption"
              rows={5}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Escreva a legenda do post..."
            />
          </section>

          {/* Hashtags */}
          <section className="space-y-2">
            <Label htmlFor="hashtags">Hashtags</Label>
            <Input
              id="hashtags"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="#exemplo #conteudo #social"
            />
          </section>
        </div>

        <aside className="space-y-6">
          {/* Networks */}
          <section className="space-y-2">
            <Label>Redes sociais</Label>
            <div className="grid gap-2">
              {NETWORKS.map(({ key, label, Icon }) => {
                const active = networks.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleNetwork(key)}
                    className={cn(
                      "flex items-center justify-between rounded-md border px-3 py-2 text-sm transition",
                      active ? "border-primary bg-primary/5" : "hover:bg-accent"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Icon size={15} />
                      {label}
                    </span>
                    {active && <Check size={14} className="text-primary" />}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Date & time */}
          <section className="space-y-2">
            <Label>Data</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon size={14} className="mr-2" />
                  {date ? format(date, "PPP", { locale: ptBR }) : "Selecione uma data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                  className="pointer-events-auto p-3"
                />
              </PopoverContent>
            </Popover>
          </section>

          <section className="space-y-2">
            <Label htmlFor="time">Hora</Label>
            <Input
              id="time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </section>

          <div className="rounded-md border bg-card p-3 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center gap-1.5 text-foreground">
              <ImageIcon size={12} /> Resumo
            </div>
            <p>
              {selectedMedia.length} mídia(s) · {networks.length} rede(s) ·{" "}
              {scheduledAt
                ? format(scheduledAt, "dd/MM 'às' HH:mm", { locale: ptBR })
                : "sem data"}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
