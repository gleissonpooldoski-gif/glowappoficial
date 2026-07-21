import { useState } from "react";
import { Instagram, Youtube, Music2, Loader2, Share2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { InstagramPost } from "@/lib/instagram";

type NetId = "instagram" | "youtube" | "tiktok";

type Props = {
  posts: InstagramPost[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved?: () => void;
};

async function ensureYoutube(post: InstagramPost) {
  if (!post.video_id || !post.scheduled_at) return { skipped: "sem vídeo/horário" };

  // Verifica arquivo
  const { data: video } = await supabase
    .from("videos").select("original_path, processed_path")
    .eq("id", post.video_id).maybeSingle();
  if (!video?.original_path && !video?.processed_path) return { skipped: "sem arquivo" };

  // Duplicata?
  const { data: existing } = await supabase
    .from("youtube_posts" as any)
    .select("id")
    .eq("video_id", post.video_id)
    .eq("scheduled_at", post.scheduled_at)
    .maybeSingle();
  if (existing) return { skipped: "já vinculado" };

  const captionRaw = post.caption ?? "";
  const hashtagsFromCaption = (captionRaw.match(/#[\p{L}\p{N}_]+/gu) ?? []) as string[];
  const hashtagsFromField = (post.hashtags ?? "").split(/\s+/).filter((s) => s.startsWith("#"));
  const allHashtags = Array.from(new Set([...hashtagsFromCaption, ...hashtagsFromField]));
  const captionNoTags = captionRaw.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim();

  let title = "";
  try {
    const { data: t } = await supabase.functions.invoke("generate-youtube-title", {
      body: { caption: captionNoTags },
    });
    title = String((t as any)?.title ?? "").trim();
  } catch { /* fallback */ }
  if (!title) title = (captionNoTags.split(/[.!?\n]/)[0] || captionNoTags || "Novo vídeo").trim();
  title = title.replace(/#[\p{L}\p{N}_]+/gu, "").trim().slice(0, 100);

  const desc = [captionNoTags, allHashtags.join(" ")].filter(Boolean).join("\n\n").slice(0, 5000);
  const tags = allHashtags.map((t) => t.replace(/^#/, "")).filter(Boolean).slice(0, 15);

  const { error } = await supabase.from("youtube_posts" as any).insert({
    video_id: post.video_id, account: "default",
    title, description: desc, tags,
    category_id: "22", privacy_status: "public",
    status: "AGENDADO", scheduled_at: post.scheduled_at,
  });
  if (error) throw error;
  return { added: true };
}

async function ensureTiktok(post: InstagramPost) {
  if (!post.video_id || !post.scheduled_at) return { skipped: "sem vídeo/horário" };

  const { data: existing } = await supabase
    .from("tiktok_posts" as any)
    .select("id")
    .eq("video_id", post.video_id)
    .eq("scheduled_at", post.scheduled_at)
    .maybeSingle();
  if (existing) return { skipped: "já vinculado" };

  const caption = [post.caption ?? "", post.hashtags ?? ""].filter(Boolean).join("\n\n").slice(0, 2200);

  const { error } = await supabase.from("tiktok_posts" as any).insert({
    video_id: post.video_id,
    account: post.account ?? "default",
    caption,
    status: "AGENDADO",
    scheduled_at: post.scheduled_at,
  });
  if (error) throw error;
  return { added: true };
}

export default function BulkAddNetworksDialog({ posts, open, onOpenChange, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  const [nets, setNets] = useState<Record<NetId, boolean>>({
    instagram: false, youtube: true, tiktok: false,
  });

  const toggle = (id: NetId) => setNets((s) => ({ ...s, [id]: !s[id] }));

  const run = async () => {
    const chosen = (Object.keys(nets) as NetId[]).filter((n) => nets[n] && n !== "instagram");
    if (chosen.length === 0) {
      toast.error("Selecione ao menos uma rede (YouTube ou TikTok).");
      return;
    }
    setBusy(true);
    let added = 0, skipped = 0, failed = 0;
    try {
      for (const post of posts) {
        for (const net of chosen) {
          try {
            const res = net === "youtube" ? await ensureYoutube(post) : await ensureTiktok(post);
            if ((res as any).added) added++;
            else skipped++;
          } catch { failed++; }
        }
      }
      toast.success(`Concluído — adicionados: ${added}, ignorados: ${skipped}${failed ? `, falhas: ${failed}` : ""}`);
      onOpenChange(false);
      onSaved?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 size={16} className="text-gold" /> Adicionar redes em massa
          </DialogTitle>
          <DialogDescription>
            As redes selecionadas serão adicionadas a <b>{posts.length}</b> post(s) agendado(s).
            Sem duplicatas — mantém data, horário, legenda e mídia originais.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label className="text-xs">Redes a adicionar</Label>

          <label className="flex items-center gap-2 rounded-md border border-border/40 bg-background/20 px-3 py-2 text-xs opacity-60 cursor-not-allowed">
            <Checkbox checked disabled />
            <Instagram size={14} className="text-pink-400" />
            <span className="flex-1">Instagram</span>
            <Badge variant="outline" className="text-[10px]">já é a origem</Badge>
          </label>

          <label className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs cursor-pointer transition-colors ${
            nets.youtube ? "border-gold/50 bg-gold/5" : "border-border/60 bg-background/30 hover:bg-background/60"
          }`}>
            <Checkbox checked={nets.youtube} onCheckedChange={() => toggle("youtube")} disabled={busy} />
            <Youtube size={14} className="text-red-400" />
            <span className="flex-1">YouTube</span>
          </label>

          <label className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs cursor-pointer transition-colors ${
            nets.tiktok ? "border-gold/50 bg-gold/5" : "border-border/60 bg-background/30 hover:bg-background/60"
          }`}>
            <Checkbox checked={nets.tiktok} onCheckedChange={() => toggle("tiktok")} disabled={busy} />
            <Music2 size={14} className="text-fuchsia-400" />
            <span className="flex-1">TikTok</span>
          </label>

          <p className="text-[11px] text-muted-foreground">
            Posts que já possuem a rede selecionada serão ignorados automaticamente.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={run} disabled={busy} className="bg-gold-gradient text-black">
            {busy && <Loader2 size={12} className="mr-1 animate-spin" />} Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
