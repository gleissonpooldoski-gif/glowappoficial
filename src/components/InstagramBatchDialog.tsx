import { useState } from "react";
import { Loader2, Layers, Instagram } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ACCOUNTS, InstagramAccount, publishInstagram, friendlyError } from "@/lib/instagram";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  videoIds: string[];
  onDone?: () => void;
};

export default function InstagramBatchDialog({ open, onOpenChange, videoIds, onDone }: Props) {
  const [account, setAccount] = useState<InstagramAccount>("resenha");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  const run = async () => {
    if (videoIds.length === 0) return;
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
            {videoIds.length} vídeo(s) serão publicados um por vez na conta escolhida.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Conta</Label>
            <Select value={account} onValueChange={(v) => setAccount(v as InstagramAccount)} disabled={busy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACCOUNTS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Button onClick={run} disabled={busy || videoIds.length === 0} className="bg-gold-gradient text-black">
            {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Instagram size={14} className="mr-1.5" />}
            Iniciar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
