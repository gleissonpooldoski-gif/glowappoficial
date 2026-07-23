import { useEffect, useMemo, useState } from "react";
import { Instagram, Youtube, Music2, Facebook, Loader2, Share2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buildYoutubeMetaFromCaption } from "@/lib/youtube-meta";
import { buildTiktokCaptionFromBase } from "@/lib/tiktok-meta";
import { createFacebookPost } from "@/lib/facebook";
import { listYoutubeChannels, type YoutubeCredential } from "@/lib/youtube";
import type { InstagramPost } from "@/lib/instagram";

type NetId = "instagram" | "youtube" | "tiktok" | "facebook";

type FbAccount = {
  id: string;
  project_id: string;
  page_id: string;
  page_name: string | null;
  page_picture: string | null;
  project_name?: string | null;
};

type Props = {
  posts: InstagramPost[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved?: () => void;
};

async function ensureYoutubeForChannel(post: InstagramPost, channelAcc: string) {
  if (!post.video_id || !post.scheduled_at) return { skipped: "sem vídeo/horário" };

  const { data: video } = await supabase
    .from("videos").select("original_path, processed_path")
    .eq("id", post.video_id).maybeSingle();
  if (!video?.original_path && !video?.processed_path) return { skipped: "sem arquivo" };

  const { data: existing } = await supabase
    .from("youtube_posts" as any)
    .select("id")
    .eq("video_id", post.video_id)
    .eq("scheduled_at", post.scheduled_at)
    .eq("account", channelAcc)
    .maybeSingle();
  if (existing) return { skipped: "já vinculado" };

  const { title, description, tags } = await buildYoutubeMetaFromCaption(
    post.caption ?? "", post.hashtags ?? "",
  );

  const { error } = await supabase.from("youtube_posts" as any).insert({
    video_id: post.video_id, account: channelAcc,
    title, description, tags,
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

  const tt = await buildTiktokCaptionFromBase(post.caption ?? "", post.hashtags ?? "");

  const { error } = await supabase.from("tiktok_posts" as any).insert({
    video_id: post.video_id,
    account: post.account ?? "default",
    caption: tt.caption,
    status: "AGENDADO",
    scheduled_at: post.scheduled_at,
  });
  if (error) throw error;
  return { added: true };
}

// Resolve project_id de um post via instagram_credentials.account (cache).
async function resolveProjectId(
  account: string,
  cache: Map<string, string | null>,
): Promise<string | null> {
  if (cache.has(account)) return cache.get(account) ?? null;
  const { data, error } = await supabase.functions.invoke("instagram-credentials", {
    body: { action: "get" },
  });
  if (error) {
    console.warn("[bulk-networks] falha ao resolver projeto da conta Instagram", { account, error: error.message });
    cache.set(account, null);
    return null;
  }
  const credentials = (data?.credentials ?? {}) as Record<string, { account: string; project_id: string | null }>;
  const match = Object.values(credentials).find((c) => c.account === account);
  const pid = match?.project_id ?? null;
  cache.set(account, pid);
  return pid;
}

async function ensureFacebook(
  post: InstagramPost,
  fbAccountByProject: Map<string, FbAccount>,
  projectCache: Map<string, string | null>,
) {
  if (!post.video_id || !post.scheduled_at) {
    console.warn("[bulk-networks] Facebook ignorado", { post_id: post.id, reason: "sem vídeo/horário", video_id: post.video_id, scheduled_at: post.scheduled_at });
    return { skipped: "sem vídeo/horário" };
  }
  const projectId = await resolveProjectId(post.account, projectCache);
  if (!projectId) {
    console.warn("[bulk-networks] Facebook ignorado", { post_id: post.id, account: post.account, reason: "sem projeto" });
    return { skipped: "sem projeto" };
  }
  const fbAccount = fbAccountByProject.get(projectId);
  if (!fbAccount) {
    console.warn("[bulk-networks] Facebook ignorado", { post_id: post.id, project_id: projectId, reason: "página não selecionada" });
    return { skipped: "página não selecionada" };
  }

  const { data: existing } = await supabase
    .from("facebook_posts" as any)
    .select("id")
    .eq("video_id", post.video_id)
    .eq("scheduled_at", post.scheduled_at)
    .eq("project_id", projectId)
    .maybeSingle();
  if (existing) {
    console.warn("[bulk-networks] Facebook ignorado", { post_id: post.id, project_id: projectId, existing_facebook_post_id: (existing as any).id, reason: "já vinculado" });
    return { skipped: "já vinculado" };
  }

  const description = [post.caption ?? "", post.hashtags ?? ""].filter(Boolean).join("\n\n");

  console.log("FACEBOOK PAYLOAD", {
    project_id: projectId,
    page_id: fbAccount.page_id,
    page_name: fbAccount.page_name,
    page_access_token: "[redacted]",
    video_id: post.video_id,
    scheduled_at: post.scheduled_at,
    description,
  });
  console.info("[bulk-networks] Criando publicação Facebook", {
    post_id: post.id,
    video_id: post.video_id,
    project_id: projectId,
    scheduled_at: post.scheduled_at,
  });
  const created = await createFacebookPost({
    project_id: projectId,
    video_id: post.video_id,
    description,
    publish_now: false,
    scheduled_at: post.scheduled_at,
  });
  console.info("[bulk-networks] Registro Facebook criado", {
    post_id: (created as any)?.post?.id,
    status: "AGENDADO",
  });
  return { added: true };
}

export default function BulkAddNetworksDialog({ posts, open, onOpenChange, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  const [nets, setNets] = useState<Record<NetId, boolean>>({
    instagram: false, youtube: true, tiktok: false, facebook: false,
  });
  const [ytChannels, setYtChannels] = useState<string[]>([]);
  const [fbAccounts, setFbAccounts] = useState<FbAccount[]>([]);

  const toggle = (id: NetId) => setNets((s) => ({ ...s, [id]: !s[id] }));

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("facebook_accounts" as any)
        .select("id, project_id, page_id, page_name, page_picture, projects:project_id(name)")
        .order("created_at", { ascending: true });
      const list: FbAccount[] = ((data as any[]) ?? []).map((r) => ({
        id: r.id, project_id: r.project_id, page_id: r.page_id,
        page_name: r.page_name, page_picture: r.page_picture,
        project_name: r.projects?.name ?? null,
      }));
      setFbAccounts(list);
    })();
  }, [open]);

  const run = async () => {
    const chosen = (Object.keys(nets) as NetId[]).filter((n) => nets[n] && n !== "instagram");
    if (chosen.length === 0) {
      toast.error("Selecione ao menos uma rede.");
      return;
    }
    console.info("[bulk-networks] Recebi redes", { networks: chosen, posts: posts.map((p) => p.id) });
    if (chosen.includes("youtube") && ytChannels.length === 0) {
      toast.error("Selecione ao menos um canal do YouTube.");
      return;
    }
    if (chosen.includes("facebook") && fbAccounts.length === 0) {
      toast.error("Nenhuma Página do Facebook conectada. Conecte em Configurações → Facebook.");
      return;
    }
    setBusy(true);
    let added = 0, skipped = 0, failed = 0;
    const skipReasons: Array<{ network: NetId; post_id: string; reason: string }> = [];
    const failureReasons: Array<{ network: NetId; post_id: string; error: unknown }> = [];
    const fbAccountByProject = new Map(fbAccounts.map((a) => [a.project_id, a]));
    const projectCache = new Map<string, string | null>();
    try {
      for (const post of posts) {
        for (const net of chosen) {
          try {
            if (net === "youtube") {
              for (const ch of ytChannels) {
                try {
                  const res = await ensureYoutubeForChannel(post, ch);
                  if ((res as any).added) added++; else { skipped++; skipReasons.push({ network: net, post_id: post.id, reason: (res as any).skipped ?? "ignorado" }); }
                } catch (error) {
                  console.error("[bulk-networks] YouTube falhou", { post_id: post.id, channel: ch, error });
                  failureReasons.push({ network: net, post_id: post.id, error });
                  failed++;
                }
              }
            } else if (net === "tiktok") {
              const res = await ensureTiktok(post);
              if ((res as any).added) added++; else { skipped++; skipReasons.push({ network: net, post_id: post.id, reason: (res as any).skipped ?? "ignorado" }); }
            } else if (net === "facebook") {
              const res = await ensureFacebook(post, fbAccountByProject, projectCache);
              if ((res as any).added) added++; else { skipped++; skipReasons.push({ network: net, post_id: post.id, reason: (res as any).skipped ?? "ignorado" }); }
            }
          } catch (error) {
            console.error("[bulk-networks] Rede falhou", { post_id: post.id, network: net, error });
            if (net === "facebook") console.error("FACEBOOK ERROR", error);
            failureReasons.push({ network: net, post_id: post.id, error });
            failed++;
          }
        }
      }
      console.info("[bulk-networks] Resultado detalhado", { added, skipped, failed, skipReasons, failureReasons });
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

          {nets.youtube && (
            <div className="rounded-md border border-border/40 bg-background/20 px-3 py-2 space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Canais do YouTube</Label>
              <YoutubeChannelPicker value={ytChannels} onChange={setYtChannels} disabled={busy} compact />
            </div>
          )}

          <label className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs cursor-pointer transition-colors ${
            nets.facebook ? "border-gold/50 bg-gold/5" : "border-border/60 bg-background/30 hover:bg-background/60"
          }`}>
            <Checkbox checked={nets.facebook} onCheckedChange={() => toggle("facebook")} disabled={busy} />
            <Facebook size={14} className="text-blue-400" />
            <span className="flex-1">Facebook</span>
          </label>

          {nets.facebook && (
            <div className="rounded-md border border-border/40 bg-background/20 px-3 py-2 space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">
                Página vinculada por projeto (somente leitura)
              </Label>
              {fbAccounts.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">
                  Nenhuma Página conectada. Conecte em Configurações → Facebook.
                </p>
              ) : (
                <>
                  <div className="space-y-1 pt-1">
                    {fbAccounts.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 text-[11px]">
                        {a.page_picture && (
                          <img src={a.page_picture} alt="" className="h-4 w-4 rounded-full object-cover" />
                        )}
                        <span className="flex-1 truncate">
                          {a.project_name ? `${a.project_name} · ` : ""}{a.page_name ?? a.page_id}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                    Cada post publicará automaticamente na Página vinculada ao seu projeto. Para trocar, vá em Configurações → Facebook.
                  </p>
                </>
              )}
            </div>
          )}

          <label className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs cursor-pointer transition-colors ${
            nets.tiktok ? "border-gold/50 bg-gold/5" : "border-border/60 bg-background/30 hover:bg-background/60"
          }`}>
            <Checkbox checked={nets.tiktok} onCheckedChange={() => toggle("tiktok")} disabled={busy} />
            <Music2 size={14} className="text-fuchsia-400" />
            <span className="flex-1">TikTok</span>
          </label>

          <p className="text-[11px] text-muted-foreground">
            Posts que já possuem a rede selecionada serão ignorados automaticamente.
            Cada projeto usa apenas sua Página correspondente.
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
