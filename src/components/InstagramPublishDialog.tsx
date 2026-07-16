import { useState } from "react";
import { Loader2, Instagram, CalendarClock, Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ACCOUNTS, InstagramAccount, publishInstagram, friendlyError } from "@/lib/instagram";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "now" | "schedule";
  videoId: string | null;
  defaultCaption?: string;
  defaultHashtags?: string;
  onDone?: () => void;
};

function localDateTimeToIso(date: string, time: string) {
  if (!date || !time) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
  return dt.toISOString();
}

export default function InstagramPublishDialog({
  open, onOpenChange, mode, videoId, defaultCaption = "", defaultHashtags = "", onDone,
}: Props) {
  const [account, setAccount] = useState<InstagramAccount>("resenha");
  const [caption, setCaption] = useState(defaultCaption);
  const [hashtags, setHashtags] = useState(defaultHashtags);
  const now = new Date();
  const plus1h = new Date(now.getTime() + 60 * 60 * 1000);
  const [date, setDate] = useState(plus1h.toISOString().slice(0, 10));
  const [time, setTime] = useState(plus1h.toTimeString().slice(0, 5));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!videoId) { toast.error("Vídeo inválido."); return; }
    setBusy(true);
    try {
      if (mode === "schedule") {
        const iso = localDateTimeToIso(date, time);
        if (!iso || new Date(iso).getTime() < Date.now() + 60_000) {
          throw new Error("Selecione uma data/hora futura (mín. 1 minuto).");
        }
        await publishInstagram({ account, videoId, caption, hashtags, publishNow: false, scheduledAt: iso });
        toast.success("Publicação agendada!");
      } else {
        toast.message("Enviando para o Instagram… isso pode levar alguns minutos.");
        await publishInstagram({ account, videoId, caption, hashtags, publishNow: true });
        toast.success("Publicado no Instagram!");
      }
      onOpenChange(false);
      onDone?.();
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Instagram size={16} className="text-gold" />
            {mode === "now" ? "Publicar agora" : "Agendar publicação"}
          </DialogTitle>
          <DialogDescription>
            {mode === "now"
              ? "O Reel será enviado imediatamente ao Instagram."
              : "Defina data e hora — a publicação acontecerá automaticamente."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Conta</Label>
            <Select value={account} onValueChange={(v) => setAccount(v as InstagramAccount)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACCOUNTS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Legenda</Label>
            <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4}
              placeholder="Escreva a legenda do Reel…" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Hashtags</Label>
            <Textarea value={hashtags} onChange={(e) => setHashtags(e.target.value)} rows={3}
              placeholder="#reels #viral #skincare" />
          </div>

          {mode === "schedule" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Data</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Hora</Label>
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={busy} className="bg-gold-gradient text-black">
            {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> :
              mode === "now" ? <Send size={14} className="mr-1.5" /> : <CalendarClock size={14} className="mr-1.5" />}
            {mode === "now" ? "Publicar" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
