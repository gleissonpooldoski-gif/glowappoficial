import { useState } from "react";
import { Loader2, Layers, Instagram, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { publishInstagram, friendlyError, platformFromProject, PLATFORM_LABEL, InstagramAccount } from "@/lib/instagram";
import { useActiveProject } from "@/context/ProjectContext";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  videoIds: string[];
  onDone?: () => void;
};

export default function InstagramBatchDialog({ open, onOpenChange, videoIds, onDone }: Props) {
  const { activeProject } = useActiveProject();
  const account: InstagramAccount | null = platformFromProject(activeProject);
  const platformLabel = account ? PLATFORM_LABEL[account] : "—";
  const platformClass =
    account === "frame"
      ? "bg-blue-500/15 text-blue-300 border-blue-400/40"
      : account === "resenha"
      ? "bg-purple-500/15 text-purple-300 border-purple-400/40"
      : "bg-muted text-muted-foreground border-border";

  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  const run = async () => {
    if (!account) { toast.error("Selecione um projeto ativo (Frame ou Resenha)."); return; }
    if (videoIds.length === 0) return;
    if (!confirm(`Estas ${videoIds.length} publicações serão enviadas agora ao projeto ${platformLabel}. Confirmar?`)) return;
    setBusy(true); setDone(0); setErrors([]);
    for (let i = 0; i < videoIds.length; i++) {
      const id = videoIds[i];
      try {
        await publishInstagram({ account, videoId: id, caption, hashtags, publishNow: true });
      } catch (e: any) {
        setErrors((prev) => [...prev, `Vídeo ${i + 1}: ${friendlyError(e)}`]);
      }
      setDone(i + 1);
    }
    setBusy(false);
    toast.success(`Lote concluído: ${videoIds.length - errors.length}/${videoIds.length}`);
    onDone?.();
  };

  const progress = videoIds.length ? Math.round((done / videoIds.length) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers size={16} className="text-gold" /> Publicação em lote
          </DialogTitle>
          <DialogDescription>
            {videoIds.length} vídeo(s) serão publicados um por vez no projeto ativo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1"><Lock size={10} /> Publicando em</Label>
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2">
              <Instagram size={14} className={account === "frame" ? "text-blue-300" : account === "resenha" ? "text-purple-300" : "text-muted-foreground"} />
              <Badge variant="outline" className={`text-[10px] font-semibold ${platformClass}`}>
                📱 {platformLabel}
              </Badge>
              <span className="text-[11px] text-muted-foreground ml-1">
                {activeProject ? `Projeto ativo: ${activeProject.name}` : "Nenhum projeto ativo selecionado"}
              </span>
            </div>
            {!account && (
              <p className="text-[11px] text-destructive">
                Selecione um projeto ativo (Frame ou Resenha) no menu superior para publicar.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Legenda (aplicada a todos)</Label>
            <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} disabled={busy} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Hashtags (aplicadas a todos)</Label>
            <Textarea value={hashtags} onChange={(e) => setHashtags(e.target.value)} rows={2} disabled={busy} />
          </div>

          {(busy || done > 0) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span>Progresso</span>
                <span className="text-muted-foreground">{done}/{videoIds.length}</span>
              </div>
              <Progress value={progress} className="h-1.5" />
            </div>
          )}

          {errors.length > 0 && (
            <div className="max-h-32 overflow-auto rounded-md border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive">
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={run} disabled={busy || !account || videoIds.length === 0} className="bg-gold-gradient text-black">
            {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Instagram size={14} className="mr-1.5" />}
            Confirmar publicação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
