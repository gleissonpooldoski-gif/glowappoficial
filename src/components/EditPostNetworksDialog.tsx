import { useEffect, useState } from "react";
import { Instagram, Youtube, Loader2, Share2, Lock } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import YoutubeChannelPicker from "./YoutubeChannelPicker";
import type { InstagramPost } from "@/lib/instagram";

type Props = {
  post: InstagramPost | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved?: () => void;
};

type LinkedYT = { id: string; status: string; account: string | null; scheduled_at: string | null };

/** Encontra YouTube posts vinculados (mesmo video_id e horário agendado). */
async function findLinkedYoutube(post: InstagramPost): Promise<LinkedYT[]> {
  if (!post.video_id || !post.scheduled_at) return [];
  const { data } = await supabase
    .from("youtube_posts" as any)
    .select("id, status, account, scheduled_at")
    .eq("video_id", post.video_id)
    .eq("scheduled_at", post.scheduled_at);
  return ((data ?? []) as any[]) as LinkedYT[];
}

export default function EditPostNetworksDialog({ post, open, onOpenChange, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linkedYT, setLinkedYT] = useState<LinkedYT[]>([]);
  const [wantIG, setWantIG] = useState(true);
  const [wantYT, setWantYT] = useState(false);
  const [ytChannels, setYtChannels] = useState<string[]>([]);
  const [hasVideoFile, setHasVideoFile] = useState<boolean>(false);

  useEffect(() => {
    if (!open || !post) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [yt, videoRow] = await Promise.all([
          findLinkedYoutube(post),
          post.video_id
            ? supabase.from("videos").select("original_path, processed_path").eq("id", post.video_id).maybeSingle()
            : Promise.resolve({ data: null } as any),
        ]);
        if (cancelled) return;
        setLinkedYT(yt);
        setWantIG(true);
        setWantYT(yt.length > 0);
        setYtChannels(yt.map((l) => l.account).filter((a): a is string => !!a));
        setHasVideoFile(Boolean((videoRow as any)?.data?.original_path || (videoRow as any)?.data?.processed_path));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, post]);

  const save = async () => {
    if (!post) return;
    if (!wantIG && !wantYT) {
      toast.error("Selecione ao menos uma rede.");
      return;
    }
    if (wantYT && !hasVideoFile) {
      toast.error("Este vídeo não possui arquivo original/processado — YouTube indisponível.");
      return;
    }
    if (wantYT && !post.scheduled_at) {
      toast.error("Post sem horário agendado.");
      return;
    }
    if (wantYT && ytChannels.length === 0) {
      toast.error("Selecione ao menos um canal do YouTube.");
      return;
    }
    setBusy(true);
    try {
      const actions: string[] = [];
      const linkedByAcc = new Map(linkedYT.map((l) => [l.account ?? "default", l]));
      const selectedSet = new Set(wantYT ? ytChannels : []);

      // 1) YouTube: adicionar canais recém-selecionados.
      if (wantYT) {
        const { buildYoutubeMetaFromCaption } = await import("@/lib/youtube-meta");
        const meta = await buildYoutubeMetaFromCaption(post.caption ?? "", post.hashtags ?? "");
        for (const acc of ytChannels) {
          if (linkedByAcc.has(acc)) continue;
          const { error } = await supabase.from("youtube_posts" as any).insert({
            video_id: post.video_id,
            account: acc,
            title: meta.title,
            description: meta.description,
            tags: meta.tags,
            category_id: "22",
            privacy_status: "public",
            status: "AGENDADO",
            scheduled_at: post.scheduled_at,
          });
          if (error) throw error;
          actions.push(`YouTube (${acc.slice(0, 8)}…) adicionado`);
        }
      }

      // 2) YouTube: remover canais desmarcados.
      for (const l of linkedYT) {
        const acc = l.account ?? "default";
        if (!selectedSet.has(acc)) {
          const { error } = await supabase.from("youtube_posts" as any).delete().eq("id", l.id);
          if (error) throw error;
          actions.push(`YouTube (${acc.slice(0, 8)}…) removido`);
        }
      }

      // 3) Instagram: remover (o post IG atual é excluído)
      if (!wantIG) {
        const { error } = await supabase.from("instagram_posts" as any).delete().eq("id", post.id);
        if (error) throw error;
        actions.push("Instagram removido");
      }

      toast.success(actions.length ? actions.join(" · ") : "Nenhuma alteração");
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar redes");
    } finally {
      setBusy(false);
    }
  };

  const scheduledLabel = post?.scheduled_at
    ? format(new Date(post.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
    : "—";

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 size={16} className="text-gold" /> Editar redes de publicação
          </DialogTitle>
          <DialogDescription>
            Adicione ou remova redes deste post agendado. O horário original é mantido.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin text-gold" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-[11px] text-muted-foreground flex items-center gap-2">
              <Lock size={11} /> Horário mantido: <b className="text-foreground">{scheduledLabel}</b>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Redes deste post</Label>
              <div className="grid gap-2">
                <label className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs cursor-pointer transition-colors ${
                  wantIG ? "border-gold/50 bg-gold/5" : "border-border/60 bg-background/30 hover:bg-background/60"
                }`}>
                  <Checkbox checked={wantIG} onCheckedChange={(v) => setWantIG(!!v)} disabled={busy} />
                  <Instagram size={14} className="text-pink-400" />
                  <span className="flex-1">Instagram</span>
                  <Badge variant="outline" className="text-[10px] border-blue-400/40 text-blue-300 bg-blue-500/10">
                    {post?.status ?? "—"}
                  </Badge>
                </label>

                <label
                  title={!hasVideoFile ? "Vídeo sem arquivo — YouTube indisponível." : undefined}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors ${
                    wantYT ? "border-gold/50 bg-gold/5" : "border-border/60 bg-background/30 hover:bg-background/60"
                  } ${!hasVideoFile ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <Checkbox
                    checked={wantYT}
                    onCheckedChange={(v) => setWantYT(!!v)}
                    disabled={busy || !hasVideoFile}
                  />
                  <Youtube size={14} className="text-red-400" />
                  <span className="flex-1">YouTube</span>
                  {linkedYT.length > 0 ? (
                    <Badge variant="outline" className="text-[10px] border-red-400/40 text-red-300 bg-red-500/10">
                      {linkedYT.length} vínculo{linkedYT.length > 1 ? "s" : ""}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
                      não vinculado
                    </Badge>
                  )}
                </label>
                {wantYT && (
                  <div className="rounded-md border border-border/40 bg-background/20 px-3 py-2">
                    <Label className="text-[11px] text-muted-foreground mb-1.5 block">Canais</Label>
                    <YoutubeChannelPicker value={ytChannels} onChange={setYtChannels} disabled={busy} compact />
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Ao adicionar o YouTube, geramos automaticamente o título a partir da legenda usando o
                mesmo vídeo. Nenhum post é duplicado.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={save} disabled={busy || loading} className="bg-gold-gradient text-black">
            {busy && <Loader2 size={12} className="mr-1 animate-spin" />} Salvar redes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
